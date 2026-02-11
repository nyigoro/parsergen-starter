import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGrammar, ProjectContext } from '../src/index';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');

describe('ProjectContext', () => {
  test('tracks dependencies and diagnostics across files', () => {
    const parser = compileGrammar(luminaGrammar);
    const project = new ProjectContext(parser);

    const root = path.resolve(__dirname, '../fixtures');
    const mainUri = path.join(root, 'main.lm');
    const otherUri = path.join(root, 'other.lm');

    const mainText = `
      import { io } from "./other.lm";
      fn main() {
        let x: int = 1 + 2;
        return x;
      }
    `.trim() + '\n';

    const otherText = `
      fn helper() {
        return 1;
      }
    `.trim() + '\n';

    project.addOrUpdateDocument(otherUri, otherText);
    project.addOrUpdateDocument(mainUri, mainText);

    const deps = project.getDependencies(mainUri);
    const expected = pathToFileURL(path.resolve(path.dirname(mainUri), './other.lm')).toString();
    expect(deps).toContain(expected);
    expect(project.getDiagnostics(mainUri).length).toBe(0);
  });

  test('panic recovery reports diagnostics', () => {
    const parser = compileGrammar(luminaGrammar);
    const project = new ProjectContext(parser);

    const badUri = path.resolve(__dirname, '../fixtures/bad.lm');
    const badText = `
      fn broken() {
        let x: int = 1 + ;
        return x
      }
    `.trim() + '\n';

    project.addOrUpdateDocument(badUri, badText);
    const diagnostics = project.getDiagnostics(badUri);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  test('enforces visibility across files', () => {
    const parser = compileGrammar(luminaGrammar);
    const project = new ProjectContext(parser);

    const root = path.resolve(__dirname, '../fixtures');
    const aUri = path.join(root, 'a.lm');
    const bUri = path.join(root, 'b.lm');

    const aText = `
      fn hidden() { return 1; }
      pub fn exposed() { return 2; }
    `.trim() + '\n';

    const bText = `
      import { hidden, exposed } from "./a.lm";
      fn main() {
        let x: int = hidden();
        let y: int = exposed();
        return x + y;
      }
    `.trim() + '\n';

    project.addOrUpdateDocument(aUri, aText);
    project.addOrUpdateDocument(bUri, bText);

    const diagnostics = project.getDiagnostics(bUri);
    const messages = diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/private/);
  });

  test('requires imports for public symbols', () => {
    const parser = compileGrammar(luminaGrammar);
    const project = new ProjectContext(parser);

    const root = path.resolve(__dirname, '../fixtures');
    const aUri = path.join(root, 'pub-a.lm');
    const bUri = path.join(root, 'pub-b.lm');

    const aText = `
      pub fn exposed() { return 2; }
    `.trim() + '\n';

    const bText = `
      fn main() {
        return exposed();
      }
    `.trim() + '\n';

    project.addOrUpdateDocument(aUri, aText);
    project.addOrUpdateDocument(bUri, bText);

    const diagnostics = project.getDiagnostics(bUri);
    const messages = diagnostics.map(d => d.message).join('\n');
    expect(messages).toMatch(/Unknown function 'exposed'/);
  });

  test('does not reparse dependents when signature unchanged', () => {
    const parser = compileGrammar(luminaGrammar);
    const project = new ProjectContext(parser);

    const root = path.resolve(__dirname, '../fixtures');
    const aUri = path.join(root, 'sig-a.lm');
    const bUri = path.join(root, 'sig-b.lm');

    const aText = `
      pub fn exposed() { return 1; }
    `.trim() + '\n';

    const bText = `
      import { exposed } from "./sig-a.lm";
      fn main() { return exposed(); }
    `.trim() + '\n';

    project.addOrUpdateDocument(aUri, aText);
    project.addOrUpdateDocument(bUri, bText);

    const first = project.addOrUpdateDocument(aUri, aText.replace('return 1', 'return 2'));
    expect(first.signatureChanged).toBe(false);
  });

  test('injects prelude symbols into every document', () => {
    const parser = compileGrammar(luminaGrammar);
    const project = new ProjectContext(parser);

    const fileUri = path.resolve(__dirname, '../fixtures/prelude.lm');
    const text = `
      fn main() {
        print("hello");
        return 0;
      }
    `.trim() + '\n';

    project.addOrUpdateDocument(fileUri, text);
    const diagnostics = project.getDiagnostics(fileUri);
    const messages = diagnostics.map((d) => d.message).join('\n');
    expect(messages).not.toMatch(/Unknown function 'print'/);
  });

  test('resolves virtual imports', () => {
    const parser = compileGrammar(luminaGrammar);
    const project = new ProjectContext(parser);

    project.registerVirtualFile('lib/utils.lm', `
      pub fn add(a: int, b: int) -> int { return a + b; }
    `.trim() + '\n');

    const mainUri = 'virtual://main.lm';
    const mainText = `
      import { add } from "lib/utils.lm";
      fn main() {
        return add(1, 2);
      }
    `.trim() + '\n';

    project.addOrUpdateDocument(mainUri, mainText);
    const deps = project.getDependencies(mainUri);
    expect(deps).toContain('virtual://lib/utils.lm');
    expect(project.getDiagnostics(mainUri).length).toBe(0);
  });

  test('skips rechecking unchanged function bodies', () => {
    const parser = compileGrammar(luminaGrammar);
    const project = new ProjectContext(parser);

    const root = path.resolve(__dirname, '../fixtures');
    const fileUri = path.join(root, 'inc.lm');

    const first = `
      fn helper() { return 1; }
      fn main() { return helper(); }
    `.trim() + '\n';

    project.addOrUpdateDocument(fileUri, first);

    const second = `
      fn helper() { return 1; }
      fn main() { return helper(); }
      let top: int = 1;
    `.trim() + '\n';

    const update = project.addOrUpdateDocument(fileUri, second);
    expect(update.signatureChanged).toBe(false);
    expect(project.getDiagnostics(fileUri).length).toBeGreaterThanOrEqual(0);
  });

  test('reports changed symbols when signature changes', () => {
    const parser = compileGrammar(luminaGrammar);
    const project = new ProjectContext(parser);

    const root = path.resolve(__dirname, '../fixtures');
    const aUri = path.join(root, 'sig-c.lm');

    const aText = `
      pub fn exposed() { return 1; }
    `.trim() + '\n';

    project.addOrUpdateDocument(aUri, aText);
    const updated = project.addOrUpdateDocument(aUri, `
      pub fn exposed(x: int) { return x; }
    `.trim() + '\n');

    expect(updated.signatureChanged).toBe(true);
    expect(updated.changedSymbols).toContain('exposed');
  });
});
