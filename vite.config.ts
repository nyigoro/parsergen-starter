import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import raw from 'vite-plugin-raw';

export default defineConfig({
  plugins: [
    react(),
    raw(), // ✅ no configuration object needed
  ],
  root: 'demo',
  server: { open: true },
  // If you need to specify file extensions, use assetsInclude instead
  assetsInclude: ['**/*.peg'],
});