import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { compileGrammar } from '../../../src/grammar/index.js';
import { generateJSFromAst } from '../../../src/lumina/codegen-js.js';
import { generateWATFromAst } from '../../../src/lumina/codegen-wasm.js';
import type { LuminaProgram } from '../../../src/lumina/ast.js';

type SmokeServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const grammarPath = path.resolve(fixtureDir, '../../../examples/lumina.peg');
const luminaGrammar = fs.readFileSync(grammarPath, 'utf-8');
const parser = compileGrammar(luminaGrammar);

const parseProgram = (source: string): LuminaProgram => parser.parse(source.trim() + '\n') as LuminaProgram;

const hashText = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 20);
const cdnModulePath = '/cdn/demo-pkg@1.0.0/index.js';
const cdnModuleCode = 'export const marker = "demo-pkg"; export function run(value) { return value + 2; }\n';
const cdnModuleIntegrity = `sha256-${createHash('sha256').update(cdnModuleCode).digest('base64')}`;

const hasWabt = (): boolean => {
  try {
    execSync('wat2wasm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

const makeHeaders = (contentType: string): Record<string, string> => ({
  'content-type': contentType,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cache-Control': 'no-store',
});

const compileJsModule = (source: string): string => {
  const ast = parseProgram(source);
  const { code } = generateJSFromAst(ast, { includeRuntime: false, target: 'esm' });
  return `${code}\nconst __lumina_main = typeof main === 'function' ? main : null;\nexport { __lumina_main as main };\n`;
};

const compileWasmBinary = (source: string): Buffer => {
  if (!hasWabt()) {
    throw new Error('wat2wasm is required to compile browser WASM smoke fixtures');
  }
  const ast = parseProgram(source);
  const { wat, diagnostics } = generateWATFromAst(ast, { exportMain: true });
  const hard = diagnostics.filter((d) => d.severity === 'error');
  if (hard.length > 0) {
    throw new Error(`WASM compile failed: ${hard[0].code ?? 'NO_CODE'} ${hard[0].message}`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-browser-smoke-'));
  const stem = hashText(source + String(Date.now()));
  const watPath = path.join(dir, `${stem}.wat`);
  const wasmPath = path.join(dir, `${stem}.wasm`);
  fs.writeFileSync(watPath, wat, 'utf-8');
  execSync(`wat2wasm "${watPath}" -o "${wasmPath}"`);
  return fs.readFileSync(wasmPath);
};

const decodeSourceParam = (raw: string | null): string => {
  if (!raw) throw new Error('missing source query parameter');
  return Buffer.from(raw, 'base64').toString('utf-8');
};

const htmlShell = (script: string): string => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Lumina Browser Smoke</title>
  </head>
  <body>
    <pre id="out"></pre>
    <script type="module">
${script}
    </script>
  </body>
</html>`;

export async function startSmokeServer(): Promise<SmokeServer> {
  const wasmBinaries = new Map<string, Buffer>();
  let serverBaseUrl = 'http://127.0.0.1';

  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = requestUrl.pathname;
    const origin = serverBaseUrl;

    try {
      if (pathname === '/health') {
        res.writeHead(200, makeHeaders('application/json; charset=utf-8'));
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (pathname === cdnModulePath) {
        res.writeHead(200, makeHeaders('text/javascript; charset=utf-8'));
        res.end(cdnModuleCode);
        return;
      }

      if (pathname === '/cdn/import-map.json') {
        const url = `${origin}${cdnModulePath}`;
        const map = {
          imports: {
            'demo-pkg': url,
          },
          integrity: {
            [url]: cdnModuleIntegrity,
          },
        };
        res.writeHead(200, makeHeaders('application/json; charset=utf-8'));
        res.end(JSON.stringify(map));
        return;
      }

      if (pathname === '/cdn/harness') {
        const url = `${origin}${cdnModulePath}`;
        const map = {
          imports: {
            'demo-pkg': url,
          },
          integrity: {
            [url]: cdnModuleIntegrity,
          },
        };
        const script = `
window.__luminaImportMap = ${JSON.stringify(map)};
window.__luminaCdnResult = null;
window.__luminaCdnError = null;
try {
  const { run, marker } = await import('demo-pkg');
  window.__luminaCdnResult = {
    marker,
    value: run(5),
    url: ${JSON.stringify(url)},
    integrity: window.__luminaImportMap.integrity[${JSON.stringify(url)}]
  };
} catch (err) {
  window.__luminaCdnError = err instanceof Error ? err.message : String(err);
}
document.getElementById('out').textContent = JSON.stringify({
  result: window.__luminaCdnResult,
  error: window.__luminaCdnError
});
`;
        const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Lumina CDN Harness</title>
    <script type="importmap">${JSON.stringify({ imports: map.imports })}</script>
  </head>
  <body>
    <pre id="out"></pre>
    <script type="module">
${script}
    </script>
  </body>
</html>`;
        res.writeHead(200, makeHeaders('text/html; charset=utf-8'));
        res.end(html);
        return;
      }

      if (pathname === '/bin' && requestUrl.searchParams.has('id')) {
        const id = requestUrl.searchParams.get('id') ?? '';
        const wasm = wasmBinaries.get(id);
        if (!wasm) {
          res.writeHead(404, makeHeaders('text/plain; charset=utf-8'));
          res.end('missing wasm');
          return;
        }
        res.writeHead(200, makeHeaders('application/wasm'));
        res.end(wasm);
        return;
      }

      if (pathname === '/harness/js') {
        const source = decodeSourceParam(requestUrl.searchParams.get('source'));
        const jsModule = compileJsModule(source);
        const encoded = Buffer.from(jsModule, 'utf-8').toString('base64');
        const script = `
const logs = [];
const outEl = document.getElementById('out');
const originalLog = console.log;
console.log = (...args) => {
  logs.push(args.map((v) => String(v)).join(' '));
};
let ret = null;
let error = null;
try {
  const code = atob(${JSON.stringify(encoded)});
  const moduleUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const mod = await import(moduleUrl);
  URL.revokeObjectURL(moduleUrl);
  if (typeof mod.main === 'function') {
    const value = await Promise.resolve(mod.main());
    if (typeof value === 'number') ret = value;
    else if (typeof value === 'bigint') ret = Number(value);
  }
} catch (err) {
  error = err instanceof Error ? err.message : String(err);
} finally {
  console.log = originalLog;
}
window.__luminaSmokeResult = { out: logs.join('\\n'), ret, error };
outEl.textContent = JSON.stringify(window.__luminaSmokeResult);
`;
        res.writeHead(200, makeHeaders('text/html; charset=utf-8'));
        res.end(htmlShell(script));
        return;
      }

      if (pathname === '/harness/wasm') {
        const source = decodeSourceParam(requestUrl.searchParams.get('source'));
        const wasm = compileWasmBinary(source);
        const id = hashText(source + String(Date.now()));
        wasmBinaries.set(id, wasm);
        const script = `
const logs = [];
const outEl = document.getElementById('out');
let ret = null;
let error = null;
try {
  const bytes = await fetch('/bin?id=${id}').then((r) => r.arrayBuffer());
  const module = await WebAssembly.compile(bytes);
  const imports = {};
  const ensureModule = (name) => {
    if (!imports[name]) imports[name] = {};
    return imports[name];
  };
  for (const imp of WebAssembly.Module.imports(module)) {
    const target = ensureModule(imp.module);
    if (imp.kind === 'function') {
      target[imp.name] = (...args) => {
        if (imp.name.startsWith('print_')) {
          logs.push(args.map((entry) => String(entry)).join(' '));
        }
        return 0;
      };
      continue;
    }
    if (imp.kind === 'memory') {
      target[imp.name] = new WebAssembly.Memory({ initial: 4 });
      continue;
    }
    if (imp.kind === 'table') {
      target[imp.name] = new WebAssembly.Table({ initial: 0, element: 'anyfunc' });
      continue;
    }
    if (imp.kind === 'global') {
      target[imp.name] = 0;
    }
  }
  const instance = await WebAssembly.instantiate(module, imports);
  if (typeof instance.exports.main === 'function') {
    const value = instance.exports.main();
    if (typeof value === 'number') ret = value;
    else if (typeof value === 'bigint') ret = Number(value);
  }
} catch (err) {
  error = err instanceof Error ? err.message : String(err);
}
window.__luminaSmokeResult = { out: logs.join('\\n'), ret, error };
outEl.textContent = JSON.stringify(window.__luminaSmokeResult);
`;
        res.writeHead(200, makeHeaders('text/html; charset=utf-8'));
        res.end(htmlShell(script));
        return;
      }

      res.writeHead(404, makeHeaders('text/plain; charset=utf-8'));
      res.end('not found');
    } catch (error) {
      res.writeHead(500, makeHeaders('application/json; charset=utf-8'));
      res.end(
        JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to acquire smoke server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  serverBaseUrl = baseUrl;
  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}
