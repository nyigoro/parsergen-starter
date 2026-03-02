import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { compileGrammar } from '../../src/grammar/index.js';
import { ProjectContext } from '../../src/project/context.js';

function makeDocSource(index: number): string {
  return `
    struct User${index} { id: i32, score: i32 }

    fn compute_${index}(seed: i32) -> i32 {
      let u = User${index} { id: ${index}, score: seed };
      u.score + u.id
    }
  `;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
}

function main() {
  const grammarPath = path.resolve('examples/lumina.peg');
  const grammar = fs.readFileSync(grammarPath, 'utf-8');
  const parser = compileGrammar(grammar);
  const project = new ProjectContext(parser, undefined, undefined, { useHmDiagnostics: true });

  const docs = 500;
  const root = path.join(os.tmpdir(), 'lumina-lsp-bench');
  const openTimes: number[] = [];
  const lookupTimes: number[] = [];

  for (let i = 0; i < docs; i++) {
    const uri = pathToFileURL(path.join(root, `doc_${i}.lm`)).toString();
    const source = makeDocSource(i);
    const start = performance.now();
    project.addOrUpdateDocument(uri, source, 1);
    openTimes.push(performance.now() - start);
  }

  for (let i = 0; i < docs; i++) {
    const uri = pathToFileURL(path.join(root, `doc_${i}.lm`)).toString();
    const query = `compute_${i}`;
    const start = performance.now();
    project.findSymbolLocation(query, uri);
    lookupTimes.push(performance.now() - start);
  }

  const payload = {
    timestamp: new Date().toISOString(),
    docs,
    open: {
      p50_ms: percentile(openTimes, 50),
      p95_ms: percentile(openTimes, 95),
      max_ms: Math.max(...openTimes),
    },
    symbolLookup: {
      p50_ms: percentile(lookupTimes, 50),
      p95_ms: percentile(lookupTimes, 95),
      max_ms: Math.max(...lookupTimes),
    },
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
