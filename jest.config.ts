/** @jest-config-loader ts-node */
import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import tsconfig from './tsconfig.json';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',       // ESM + TS support :contentReference[oaicite:1]{index=1}
  testEnvironment: 'node',
  verbose: true,
  extensionsToTreatAsEsm: ['.ts'],

  moduleNameMapper: pathsToModuleNameMapper(
    tsconfig.compilerOptions.paths as Record<string, string[]>, 
    { prefix: '<rootDir>/src/' }
  ),
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true }]
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'], 
};

export default config;
