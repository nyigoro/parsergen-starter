#!/usr/bin/env node
import path from 'node:path';
import { runLumina, setDefaultStdPath } from './lumina-core.js';

const isMain = typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;
if (isMain) {
  const currentDir = path.dirname(__filename);
  setDefaultStdPath(path.resolve(currentDir, '..', '..', 'std'));
  runLumina(process.argv.slice(2));
}
