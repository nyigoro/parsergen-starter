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
      case 'const-binary': {
        const left = this.evaluate(expr.left, location);
        const right = this.evaluate(expr.right, location);
        if (left == null || right == null) return null;
        switch (expr.op) {
          case '+':
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
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
          default:
            return null;
        }
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
    const lhs = this.evaluate(left);
    const rhs = this.evaluate(right);
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

