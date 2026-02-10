#!/usr/bin/env node
import { runParsergen } from './cli-core.js';

const isMain = typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;
if (isMain) {
  runParsergen(process.argv.slice(2), { deprecate: true });
}
