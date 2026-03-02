import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileGrammar } from '../src/grammar/index.js';
import { ProjectContext } from '../src/project/context.js';

const grammarPath = path.resolve(__dirname, '../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

describe('project stress reliability', () => {
  test('indexes 1000 files without crashes', () => {
    const project = new ProjectContext(parser, undefined, undefined, {
      useHmDiagnostics: true,
    });

    const fileCount = 1000;
    for (let i = 0; i < fileCount; i++) {
      const uri = pathToFileURL(path.join(process.cwd(), '.tmp-stress', `stress_${i}.lm`)).toString();
      const source = `
        fn value_${i}(x: i32) -> i32 {
          let y = x + ${i % 17};
          y
        }
      `;
      project.addOrUpdateDocument(uri, source, 1);
    }

    project.parseAll();
    const docs = project.listDocuments();
    expect(docs.length).toBe(fileCount);

    const diagnostics = project.getDiagnostics();
    const fatal = diagnostics.filter((d) => d.severity === 'error' && d.code === 'CRASH');
    expect(fatal).toHaveLength(0);
  });
});
