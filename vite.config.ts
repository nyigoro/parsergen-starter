import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import rawPlugin from 'vite-plugin-raw';

export default defineConfig({
  plugins: [
    react(),
    rawPlugin({ match: /\.peg$/, exclude: undefined }) // ← handle raw .peg import
  ],
  root: 'demo',
  server: { open: true },
});
