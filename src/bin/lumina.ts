#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runLumina, setDefaultStdPath } from './lumina-core.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
setDefaultStdPath(path.resolve(currentDir, '..', '..', 'std'));

const entry = pathToFileURL(process.argv[1]).href;
if (import.meta.url === entry) {
  runLumina(process.argv.slice(2));
}
