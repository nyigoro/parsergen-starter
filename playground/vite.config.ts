import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OutputAsset, OutputBundle, OutputChunk, Plugin } from 'rollup';
import { luminaPlugin } from '../demo/vite-plugin-lumina';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const toPortablePath = (id: string): string => id.replaceAll(path.sep, '/');
const externalSourceMapComment = /\r?\n?\/\/# sourceMappingURL=(?!data:)[^\s]+(?:\r?\n)?$/;

const stripPlaygroundSourceMapComments = (): Plugin => ({
  name: 'strip-playground-source-map-comments',
  generateBundle(_options, bundle: OutputBundle) {
    for (const artifact of Object.values(bundle)) {
      if (!artifact.fileName.endsWith('.js')) continue;
      if (artifact.type === 'chunk') {
        const chunk = artifact as OutputChunk;
        chunk.code = chunk.code.replace(externalSourceMapComment, '');
        continue;
      }
      const asset = artifact as OutputAsset;
      if (typeof asset.source === 'string') {
        asset.source = asset.source.replace(externalSourceMapComment, '');
      } else {
        const source = Buffer.from(asset.source).toString('utf-8');
        asset.source = Buffer.from(source.replace(externalSourceMapComment, ''));
      }
    }
  },
});

const playgroundChunkFor = (id: string): string | undefined => {
  const portableId = toPortablePath(id);
  if (portableId.includes('/node_modules/peggy/') || portableId.includes('/node_modules/moo/')) {
    return 'compiler-parser';
  }
  if (
    portableId.endsWith('/src/lumina/semantic.ts') ||
    portableId.endsWith('/src/lumina/hm-infer.ts') ||
    portableId.includes('/src/project/')
  ) {
    return 'compiler-analysis';
  }
  if (
    portableId.endsWith('/src/lumina/codegen-js.ts') ||
    portableId.endsWith('/src/lumina/codegen.ts') ||
    portableId.endsWith('/src/lumina/render-lowering.ts')
  ) {
    return 'compiler-js';
  }
  if (
    portableId.endsWith('/src/lumina/codegen-wasm.ts') ||
    portableId.endsWith('/src/lumina/wasm-emit-binary.ts') ||
    portableId.endsWith('/src/lumina/wasm-types.ts')
  ) {
    return 'compiler-wasm';
  }
  if (portableId.includes('/src/lumina/module-registry')) {
    return 'compiler-stdlib';
  }
  if (portableId.includes('/src/lumina/')) {
    return 'compiler-core';
  }
  if (
    portableId.includes('/node_modules/@codemirror/') ||
    portableId.includes('/node_modules/@lezer/') ||
    portableId.includes('/node_modules/codemirror/')
  ) {
    return 'editor-core';
  }
  return undefined;
};

export default ({ command }) => ({
  plugins: [luminaPlugin(), stripPlaygroundSourceMapComments()],
  root: '.',
  base: command === 'serve' ? '/playground/' : './',
  server: {
    open: false,
    host: '127.0.0.1',
    port: 5175,
    strictPort: true,
    hmr: {
      path: '/playground/',
    },
  },
  resolve: {
    alias: {
      'node:fs/promises': path.resolve(currentDir, '../demo/shims/fs-promises.ts'),
      'fs/promises': path.resolve(currentDir, '../demo/shims/fs-promises.ts'),
      'node:crypto': path.resolve(currentDir, '../demo/shims/node-crypto.ts'),
      crypto: path.resolve(currentDir, '../demo/shims/node-crypto.ts'),
      'node:readline': path.resolve(currentDir, '../demo/shims/node-readline.ts'),
      readline: path.resolve(currentDir, '../demo/shims/node-readline.ts'),
      'node:worker_threads': path.resolve(currentDir, '../demo/shims/node-worker-threads.ts'),
      worker_threads: path.resolve(currentDir, '../demo/shims/node-worker-threads.ts'),
      tty: path.resolve(currentDir, '../demo/shims/tty.ts'),
      url: path.resolve(currentDir, '../demo/shims/url.ts'),
    },
  },
  build: {
    outDir: '../docs/playground',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: playgroundChunkFor,
      },
      onwarn(warning, warn) {
        const warningId = typeof warning.id === 'string' ? toPortablePath(warning.id) : '';
        if (warning.code === 'EVAL' && warningId.includes('/node_modules/peggy/')) return;
        warn(warning);
      },
    },
  },
});
