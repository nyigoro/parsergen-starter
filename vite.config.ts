import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import postcssImport from 'postcss-import';

export default defineConfig({
  plugins: [
    react(),
  ],
  root: 'demo',
  base: './',
  server: { open: true },
  // If you need to specify file extensions, use assetsInclude instead
  assetsInclude: ['**/*.peg'],
  resolve: {
    alias: {
      'fs/promises': path.resolve(__dirname, 'demo/shims/fs-promises.ts'),
      tty: path.resolve(__dirname, 'demo/shims/tty.ts'),
    },
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          codemirror: ['@uiw/react-codemirror', '@codemirror/lang-javascript', '@codemirror/language', '@codemirror/theme-one-dark'],
          peggy: ['peggy'],
        },
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
