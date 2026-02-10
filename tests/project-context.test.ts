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
});
