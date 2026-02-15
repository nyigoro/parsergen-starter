// eslint.config.js
import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettier,

  // TypeScript strict config
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-undef': 'off',
    },
  },

  // VS Code extension TypeScript (separate tsconfig)
  {
    files: ['vscode-extension/src/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: './vscode-extension/tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-undef': 'off',
    },
  },

  // JavaScript config (ESM)
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
    },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-control-regex': 'warn',
      'no-useless-escape': 'warn',
      'no-empty': 'warn',
    },
  },

  // CommonJS scripts
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-undef': 'off',
    },
  },

  // Test files
  {
    files: [
      '**/*.test.ts', '**/*.spec.ts',
      '**/*.test.js', '**/*.spec.js',
      'tests/**/*.ts', 'tests/**/*.js',
    ],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-undef': 'off',
    },
  },

  // CLI and REPL
  {
    files: ['src/bin/**/*.ts', 'src/repl.ts', 'demo/**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        document: 'readonly',
        window: 'readonly',
        performance: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-undef': 'off',
    },
  },

  // Command helpers (allow console output)
  {
    files: ['src/commands/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-undef': 'off',
    },
  },

  // Ignore specific files/folders
  {
    ignores: [
      'node_modules/',
      'dist/',
      'docs/',
      'build/',
      'lib/',
      '*.tsbuildinfo',
      '*.d.ts',
      '**/*.d.ts',
      'coverage/',
      '.nyc_output',
      'tmp/',
      'temp/',
      '.vscode/',
      '.idea/',
      '*.swp',
      '*.swo',
      '*~',
      '.DS_Store',
      'Thumbs.db',
      'src/grammar/calculator.js',
      'examples/template/transform.js',
      'examples/template/codegen.js',
      'scripts/repl-smoke.cjs',
      'codegen.js',
      'transform.js',
      'grammar.peg',
      '.parsergenrc',
      'examples/json-parser/*.js',
      'examples/json-parser/*.mjs',
      'examples/json-parser/*.cjs',
      'examples/json-parser/lumina-runtime.*',
      'examples/**/*.js',
      'examples/**/*.cjs',
      'examples/**/*.mjs',
      'lumina-runtime.js',
      'lumina.out.js',
      '*.generated.js',
      'demo.js',
      'test-lumina-pkg/**',
      'examples/wasm-hello/benchmark.ts',
      'vscode-extension/dist/**',
    ],
  },
];
