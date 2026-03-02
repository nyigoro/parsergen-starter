import type { Diagnostic } from '../parser/index.js';
import type { Location } from '../utils/index.js';
import type { ConstExpr } from './types.js';

const defaultLocation: Location = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

export class ConstEvaluator {
  private readonly bindings = new Map<string, number>();
  private readonly diagnostics: Diagnostic[] = [];

  evaluate(expr: ConstExpr, location?: Location): number | null {
    const value = this.evaluateValue(expr, location);
    if (value == null) return null;
    if (typeof value !== 'number') {
      this.diagnostics.push({
        severity: 'error',
        code: 'CONST-NON-NUMERIC',
        message: 'Const expression must evaluate to a numeric value',
        location: location ?? defaultLocation,
        source: 'lumina',
        relatedInformation: [],
      });
      return null;
    }
    return Math.trunc(value);
  }

  evaluateAny(expr: ConstExpr, location?: Location): number | boolean | null {
    return this.evaluateValue(expr, location);
  }

  private evaluateValue(expr: ConstExpr, location?: Location): number | boolean | null {
    switch (expr.kind) {
      case 'const-literal':
        return expr.value;
      case 'const-param': {
        const bound = this.bindings.get(expr.name);
        if (bound == null) {
          this.diagnostics.push({
            severity: 'error',
            code: 'CONST-UNBOUND',
            message: `Const parameter '${expr.name}' is not bound`,
            location: location ?? defaultLocation,
            source: 'lumina',
            relatedInformation: [],
          });
          return null;
        }
        return bound;
      }
      case 'const-unary': {
        const value = this.evaluateValue(expr.expr, location);
        if (value == null) return null;
        if (expr.op === '-') {
          if (typeof value !== 'number') {
            this.diagnostics.push({
              severity: 'error',
              code: 'CONST-TYPE',
              message: "Unary '-' expects a numeric operand",
              location: location ?? defaultLocation,
              source: 'lumina',
              relatedInformation: [],
            });
            return null;
          }
          return -value;
        }
        if (expr.op === '!') {
          if (typeof value !== 'boolean') {
            this.diagnostics.push({
              severity: 'error',
              code: 'CONST-TYPE',
              message: "Unary '!' expects a boolean operand",
              location: location ?? defaultLocation,
              source: 'lumina',
              relatedInformation: [],
            });
            return null;
          }
          return !value;
        }
        return null;
      }
      case 'const-binary': {
        const left = this.evaluateValue(expr.left, location);
        const right = this.evaluateValue(expr.right, location);
        if (left == null || right == null) return null;
        switch (expr.op) {
          case '+':
          case '-':
          case '*':
          case '/': {
            if (typeof left !== 'number' || typeof right !== 'number') {
              this.diagnostics.push({
                severity: 'error',
                code: 'CONST-TYPE',
                message: `Operator '${expr.op}' expects numeric operands`,
                location: location ?? defaultLocation,
                source: 'lumina',
                relatedInformation: [],
              });
              return null;
            }
            if (expr.op === '+') return left + right;
            if (expr.op === '-') return left - right;
            if (expr.op === '*') return left * right;
            if (right === 0) {
              this.diagnostics.push({
                severity: 'error',
                code: 'CONST-DIV-ZERO',
                message: 'Division by zero in const expression',
                location: location ?? defaultLocation,
                source: 'lumina',
                relatedInformation: [],
              });
              return null;
            }
            return Math.floor(left / right);
          }
          case '<':
          case '<=':
          case '>':
          case '>=': {
            if (typeof left !== 'number' || typeof right !== 'number') {
              this.diagnostics.push({
                severity: 'error',
                code: 'CONST-TYPE',
                message: `Operator '${expr.op}' expects numeric operands`,
                location: location ?? defaultLocation,
                source: 'lumina',
                relatedInformation: [],
              });
              return null;
            }
            if (expr.op === '<') return left < right;
            if (expr.op === '<=') return left <= right;
            if (expr.op === '>') return left > right;
            return left >= right;
          }
          case '==':
            return left === right;
          case '!=':
            return left !== right;
          case '&&':
          case '||': {
            if (typeof left !== 'boolean' || typeof right !== 'boolean') {
              this.diagnostics.push({
                severity: 'error',
                code: 'CONST-TYPE',
                message: `Operator '${expr.op}' expects boolean operands`,
                location: location ?? defaultLocation,
                source: 'lumina',
                relatedInformation: [],
              });
              return null;
            }
            return expr.op === '&&' ? left && right : left || right;
          }
          default:
            return null;
        }
      }
      case 'const-call': {
        if (expr.name !== 'min' && expr.name !== 'max') {
          this.diagnostics.push({
            severity: 'error',
            code: 'CONST-CALL',
            message: `Unsupported const function '${expr.name}'. Supported functions: min, max`,
            location: location ?? defaultLocation,
            source: 'lumina',
            relatedInformation: [],
          });
          return null;
        }
        if (expr.args.length !== 2) {
          this.diagnostics.push({
            severity: 'error',
            code: 'CONST-CALL-ARITY',
            message: `Const function '${expr.name}' expects exactly 2 arguments`,
            location: location ?? defaultLocation,
            source: 'lumina',
            relatedInformation: [],
          });
          return null;
        }
        const left = this.evaluateValue(expr.args[0], location);
        const right = this.evaluateValue(expr.args[1], location);
        if (left == null || right == null) return null;
        if (typeof left !== 'number' || typeof right !== 'number') {
          this.diagnostics.push({
            severity: 'error',
            code: 'CONST-TYPE',
            message: `Const function '${expr.name}' expects numeric arguments`,
            location: location ?? defaultLocation,
            source: 'lumina',
            relatedInformation: [],
          });
          return null;
        }
        return expr.name === 'min' ? Math.min(left, right) : Math.max(left, right);
      }
      case 'const-if': {
        const condition = this.evaluateValue(expr.condition, location);
        if (condition == null) return null;
        if (typeof condition !== 'boolean') {
          this.diagnostics.push({
            severity: 'error',
            code: 'CONST-IF-COND',
            message: 'Const if condition must evaluate to bool',
            location: location ?? defaultLocation,
            source: 'lumina',
            relatedInformation: [],
          });
          return null;
        }
        return this.evaluateValue(condition ? expr.thenExpr : expr.elseExpr, location);
      }
      default:
        return null;
    }
  }

  bind(name: string, value: number): void {
    this.bindings.set(name, value);
  }

  unbind(name: string): void {
    this.bindings.delete(name);
  }

  equal(left: ConstExpr, right: ConstExpr): boolean {
    const lhs = this.evaluateValue(left);
    const rhs = this.evaluateValue(right);
    if (lhs != null && rhs != null) return lhs === rhs;
    return JSON.stringify(left) === JSON.stringify(right);
  }

  getDiagnostics(): Diagnostic[] {
    return [...this.diagnostics];
  }

  clearDiagnostics(): void {
    this.diagnostics.length = 0;
  }
}
