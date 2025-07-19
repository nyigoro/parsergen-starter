import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import postcssImport from 'postcss-import';

export default defineConfig({
  plugins: [
    react(),
  ],
  root: 'demo',
  server: { open: true },
  // If you need to specify file extensions, use assetsInclude instead
  assetsInclude: ['**/*.peg'],
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