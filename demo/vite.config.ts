import { defineConfig } from 'vite';
import path from 'node:path';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import postcssImport from 'postcss-import';
import { luminaPlugin } from './vite-plugin-lumina';

export default defineConfig({
  plugins: [
    luminaPlugin(),
  ],
  root: '.',
  base: './',
  server: {
    open: true,
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/docs': {
        target: 'http://127.0.0.1:5174',
        changeOrigin: true,
        ws: true,
      },
      '/playground': {
        target: 'http://127.0.0.1:5175',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  optimizeDeps: {
    exclude: ['lumina-lang'],
  },
  // If you need to specify file extensions, use assetsInclude instead
  assetsInclude: ['**/*.peg'],
  resolve: {
    alias: {
      'fs/promises': path.resolve(__dirname, 'shims/fs-promises.ts'),
      'node:fs/promises': path.resolve(__dirname, 'shims/fs-promises.ts'),
      readline: path.resolve(__dirname, 'shims/node-readline.ts'),
      crypto: path.resolve(__dirname, 'shims/node-crypto.ts'),
      worker_threads: path.resolve(__dirname, 'shims/node-worker-threads.ts'),
      url: path.resolve(__dirname, 'shims/url.ts'),
      tty: path.resolve(__dirname, 'shims/tty.ts'),
      'node:crypto': path.resolve(__dirname, 'shims/node-crypto.ts'),
      'node:readline': path.resolve(__dirname, 'shims/node-readline.ts'),
      'node:worker_threads': path.resolve(__dirname, 'shims/node-worker-threads.ts'),
    },
  },
  build: {
    outDir: '../docs',
    emptyOutDir: false,
    sourcemap: false,
    rollupOptions: {
      external: [],
      onwarn(warning, warn) {
        if (warning.code === 'EVAL') return;
        warn(warning);
      },
    },
  },
  css: {
    postcss: {
      plugins: [
        postcssImport(),
        tailwindcss(),
        autoprefixer(),
      ],
    },
  },
});
