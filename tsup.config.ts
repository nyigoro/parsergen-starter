// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],      // Output formats
  dts: false,                  // Emit .d.ts type declarations (handled by build:dts)
  sourcemap: true,
  clean: true,                 // Clean output dir before build
  minify: false,
  target: 'es2020',
  outDir: 'dist',
  splitting: false,           // Disable code splitting for CJS
  external: ['chalk'],        // Example: mark dependencies as external
  esbuildOptions(options) {
    // For example, mark all *.peg files as raw text imports
    options.loader = {
      ...options.loader,
      '.peg': 'text',
    };
  },
});
