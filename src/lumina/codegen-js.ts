import { type LuminaProgram, type LuminaStatement, type LuminaExpr, type LuminaMatchPattern } from './ast.js';

export interface CodegenJsOptions {
  target?: 'esm' | 'cjs';
  includeRuntime?: boolean;
}

export interface CodegenJsResult {
  code: string;
}

export function generateJSFromAst(program: LuminaProgram, options: CodegenJsOptions = {}): CodegenJsResult {
  const generator = new JSGenerator(options);
  return { code: generator.generate(program) };
}

class JSGenerator {
  private indentLevel = 0;
  private readonly target: 'esm' | 'cjs';
  private readonly includeRuntime: boolean;
  private matchCounter = 0;

  constructor(options: CodegenJsOptions) {
    this.target = options.target ?? 'esm';
    this.includeRuntime = options.includeRuntime !== false;
  }

  generate(node: LuminaProgram): string {
    const lines: string[] = [];
    if (this.includeRuntime) {
      lines.push('function print(...args) { console.log(...args); }');
      lines.push('function __set(obj, prop, value) { obj[prop] = value; return value; }');
    }
    for (const stmt of node.body) {
      const chunk = this.emitStatement(stmt);
      if (chunk) lines.push(chunk);
    }
    if (this.target === 'cjs') {
      lines.push('module.exports = { print, __set };');
    } else {
      lines.push('export { print, __set };');
    }
    return lines.join('\n') + '\n';
  }

  private emitStatement(stmt: LuminaStatement): string | null {
    switch (stmt.type) {
      case 'FnDecl': {
        const params = stmt.params.map((p) => p.name).join(', ');
        const body = this.emitBlock(stmt.body);
        return `${this.pad()}function ${stmt.name}(${params}) ${body}`;
      }
      case 'Let':
        return `${this.pad()}const ${stmt.name} = ${this.emitExpr(stmt.value)};`;
      case 'Return':
        return `${this.pad()}return ${this.emitExpr(stmt.value)};`;
      case 'Assign':
        return `${this.pad()}${this.emitExpr(stmt.target as LuminaExpr)} = ${this.emitExpr(stmt.value)};`;
      case 'ExprStmt':
        return `${this.pad()}${this.emitExpr(stmt.expr)};`;
      case 'If': {
        const cond = this.emitExpr(stmt.condition);
        const thenBlock = this.emitBlock(stmt.thenBlock);
        const elseBlock = stmt.elseBlock ? ` else ${this.emitBlock(stmt.elseBlock)}` : '';
        return `${this.pad()}if (${cond}) ${thenBlock}${elseBlock}`;
      }
      case 'While': {
        const cond = this.emitExpr(stmt.condition);
        const body = this.emitBlock(stmt.body);
        return `${this.pad()}while (${cond}) ${body}`;
      }
      case 'MatchStmt': {
        const stmtCode = this.emitMatchStatement(stmt.value, stmt.arms);
        return `${this.pad()}${stmtCode}`;
      }
      case 'Block':
        return this.emitBlock(stmt);
      case 'TypeDecl':
      case 'StructDecl':
      case 'EnumDecl':
      case 'Import':
      case 'ErrorNode':
        return null;
      default:
        return null;
    }
  }

  private emitBlock(block: { body: LuminaStatement[] }, options?: { expressionContext?: boolean }): string {
    const lines: string[] = [];
    lines.push('{');
    this.indentLevel++;
    const lastIdx = block.body.length - 1;
    block.body.forEach((stmt, idx) => {
      const isTail = idx === lastIdx;
      if (options?.expressionContext && isTail && this.isExpressionStatement(stmt)) {
        const expr = (stmt as Extract<LuminaStatement, { type: 'ExprStmt' }>).expr;
        lines.push(`${this.pad()}return ${this.emitExpr(expr)};`);
        return;
      }
      const chunk = this.emitStatement(stmt);
      if (chunk) lines.push(chunk);
    });
    this.indentLevel--;
    lines.push(`${this.pad()}}`);
    return lines.join('\n');
  }

  private emitExpr(expr: LuminaExpr): string {
    switch (expr.type) {
      case 'Number':
        return String(expr.value);
      case 'Boolean':
        return expr.value ? 'true' : 'false';
      case 'String':
        return JSON.stringify(expr.value);
      case 'Identifier':
        return expr.name;
      case 'Binary':
        return `(${this.emitExpr(expr.left)} ${expr.op} ${this.emitExpr(expr.right)})`;
      case 'Call':
        if (expr.enumName) return this.emitEnumConstruct(expr.enumName, expr.callee.name, expr.args);
        return `${expr.callee.name}(${expr.args.map((arg) => this.emitExpr(arg)).join(', ')})`;
      case 'Member': {
        if (expr.object.type === 'Identifier' && isUpperIdent(expr.object.name) && isUpperIdent(expr.property)) {
          return this.emitEnumConstruct(expr.object.name, expr.property, []);
        }
        return `${this.emitExpr(expr.object)}.${expr.property}`;
      }
      case 'StructLiteral': {
        const fields = expr.fields.map((field) => `${field.name}: ${this.emitExpr(field.value)}`).join(', ');
        return `{ ${fields} }`;
      }
    case 'MatchExpr':
        return this.emitMatchExpr(expr.value, expr.arms);
      case 'IsExpr': {
        const value = this.emitExpr(expr.value);
        const variant = JSON.stringify(expr.variant);
        return `${value} && ${value}.$tag === ${variant}`;
      }
      default:
        return 'undefined';
    }
  }

  private emitEnumConstruct(enumName: string, variant: string, args: LuminaExpr[]): string {
    if (args.length === 0) return `{ $tag: ${JSON.stringify(variant)} }`;
    if (args.length === 1) return `{ $tag: ${JSON.stringify(variant)}, $payload: ${this.emitExpr(args[0])} }`;
    return `{ $tag: ${JSON.stringify(variant)}, $payload: [${args.map((arg) => this.emitExpr(arg)).join(', ')}] }`;
  }

  private emitMatchExpr(
    value: LuminaExpr,
    arms: Array<{ pattern: LuminaMatchPattern; body: LuminaExpr }>
  ): string {
    const matchId = `__match_val_${this.matchCounter++}`;
    const header = `const ${matchId} = ${this.emitExpr(value)};`;
    const switchBody = this.emitMatchSwitch(matchId, arms, true);
    return `(() => {\n${this.padLine(header)}\n${this.padLine(switchBody)}\n})()`;
  }

  private emitMatchStatement(
    value: LuminaExpr,
    arms: Array<{ pattern: LuminaMatchPattern; body: { body: LuminaStatement[] } }>
  ): string {
    const matchId = `__match_val_${this.matchCounter++}`;
    const header = `${this.pad()}const ${matchId} = ${this.emitExpr(value)};`;
    const switchBody = this.emitMatchSwitch(matchId, arms, false);
    return `${header}\n${this.pad()}${switchBody}`;
  }

  private emitMatchSwitch(
    matchId: string,
    arms: Array<{ pattern: LuminaMatchPattern; body: LuminaExpr | { body: LuminaStatement[] } }>,
    asExpression: boolean
  ): string {
    const lines: string[] = [];
    lines.push(`switch (${matchId}.$tag) {`);
    let hasWildcard = false;
    for (const arm of arms) {
      if (arm.pattern.type === 'WildcardPattern') {
        hasWildcard = true;
        lines.push(`  default: {`);
        lines.push(...this.emitMatchCaseBody(matchId, arm.pattern, arm.body, asExpression, 2));
        lines.push(`  }`);
        continue;
      }
      lines.push(`  case ${JSON.stringify(arm.pattern.variant)}: {`);
      lines.push(...this.emitMatchCaseBody(matchId, arm.pattern, arm.body, asExpression, 2));
      lines.push(`  }`);
    }
    if (!hasWildcard) {
      lines.push(`  default: {`);
      lines.push(`    throw new Error("Exhaustiveness failure");`);
      lines.push(`  }`);
    }
    lines.push(`}`);
    return lines.join('\n');
  }

  private emitMatchCaseBody(
    matchId: string,
    pattern: LuminaMatchPattern,
    body: LuminaExpr | { body: LuminaStatement[] },
    asExpression: boolean,
    indent: number
  ): string[] {
    const pad = '  '.repeat(indent);
    const lines: string[] = [];
    const bindings = this.emitBindings(matchId, pattern);
    if (bindings) {
      bindings.split('\n').forEach((line) => lines.push(`${pad}${line}`));
    }
    if ('type' in body && typeof body.type === 'string') {
      const value = this.emitExpr(body as LuminaExpr);
      lines.push(`${pad}return ${value};`);
    } else {
      for (const stmt of (body as { body: LuminaStatement[] }).body) {
        const stmtLine = this.emitStatement(stmt);
        if (stmtLine) lines.push(`${pad}${stmtLine.trimStart()}`);
      }
      if (!asExpression) {
        lines.push(`${pad}break;`);
      }
    }
    if (
      asExpression &&
      !('type' in body && typeof body.type === 'string') &&
      !this.hasReturnLikeStatement(body as { body: LuminaStatement[] })
    ) {
      lines.push(`${pad}return undefined;`);
    }
    return lines;
  }

  private emitBindings(matchId: string, pattern: LuminaMatchPattern): string {
    if (pattern.type !== 'EnumPattern') return '';
    if (pattern.bindings.length === 0) return '';
    return pattern.bindings
      .map((binding, idx) => {
        if (binding === '_') return '';
        if (pattern.bindings.length === 1) {
          return `const ${binding} = ${matchId}.$payload;`;
        }
        return `const ${binding} = ${matchId}.$payload[${idx}];`;
      })
      .filter(Boolean)
      .join('\n');
  }

  private pad(): string {
    return '  '.repeat(this.indentLevel);
  }

  private isExpressionStatement(stmt: LuminaStatement): boolean {
    return stmt.type === 'ExprStmt';
  }

  private hasReturnLikeStatement(body: { body: LuminaStatement[] }): boolean {
    return body.body.some((stmt) => stmt.type === 'Return');
  }

  private padLine(line: string): string {
    if (!line) return '';
    return line
      .split('\n')
      .map((chunk) => (chunk ? `${this.pad()}${chunk}` : chunk))
      .join('\n');
  }
}

function isUpperIdent(name: string): boolean {
  return /^[A-Z]/.test(name);
}
