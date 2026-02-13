const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..', '..');
const parserPath = path.join(__dirname, 'json-parser.cjs');
const runtimePath = path.join(__dirname, 'lumina-runtime.cjs');

const tests = [
  { name: 'object', input: '{"name": "Lumina"}', expect: 'Parsed successfully:' },
  { name: 'array', input: '[1, 2, 3]', expect: 'Parsed successfully:' },
  { name: 'null', input: 'null', expect: 'Parsed successfully:' },
  { name: 'true', input: 'true', expect: 'Parsed successfully:' },
  { name: 'string', input: '"hello"', expect: 'Parsed successfully:' },
  { name: 'nested', input: '{"nested": {"array": [1, 2, 3]}}', expect: 'Parsed successfully:' },
  { name: 'invalid-object', input: '{invalid}', expect: 'Parse error:' },
  { name: 'trailing-comma', input: '[1, 2, 3,]', expect: 'Parse error:' },
  { name: 'missing-value', input: '{"key": }', expect: 'Parse error:' },
];

if (!fs.existsSync(parserPath)) {
  console.error('Missing compiled parser:', parserPath);
  console.error('Compile it first with:');
  console.error('  npx tsx src/bin/lumina.ts compile examples/json-parser/json-parser.lm --out examples/json-parser/json-parser.cjs --target cjs --source-map inline');
  process.exit(1);
}

if (!fs.existsSync(runtimePath)) {
  console.error('Missing runtime:', runtimePath);
  process.exit(1);
}

const runCase = (input) => {
  const lines = [input, 'exit'];
  const script = `
const { io } = require(${JSON.stringify(runtimePath)});

const Option = {
  Some: (value) => ({ tag: 'Some', values: [value] }),
  None: { tag: 'None', values: [] },
};
const Result = {
  Ok: (value) => ({ tag: 'Ok', values: [value] }),
  Err: (error) => ({ tag: 'Err', values: [error] }),
};

const str = {
  length: (value) => value.length,
  concat: (a, b) => a + b,
  split: (value, sep) => value.split(sep),
  trim: (value) => value.trim(),
  contains: (haystack, needle) => haystack.includes(needle),
  eq: (a, b) => a === b,
  char_at: (value, index) => {
    if (Number.isNaN(index) || index < 0 || index >= value.length) return Option.None;
    return Option.Some(value.charAt(index));
  },
  is_whitespace: (value) => value === ' ' || value === '\\n' || value === '\\t' || value === '\\r',
  is_digit: (value) => {
    if (!value || value.length === 0) return false;
    const code = value.charCodeAt(0);
    return code >= 48 && code <= 57;
  },
  to_int: (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? Result.Err(\`Invalid int: \${value}\`) : Result.Ok(parsed);
  },
  to_float: (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? Result.Err(\`Invalid float: \${value}\`) : Result.Ok(parsed);
  },
  from_int: (value) => String(Math.trunc(value)),
  from_float: (value) => String(value),
};

global.print = io.print;
global.println = io.println;
global.readLine = (() => {
  const lines = ${JSON.stringify(lines)};
  let idx = 0;
  return () => (idx < lines.length ? Option.Some(lines[idx++]) : Option.None);
})();

global.length = str.length;
global.concat = str.concat;
global.split = str.split;
global.trim = str.trim;
global.contains = str.contains;
global.eq = str.eq;
global.char_at = str.char_at;
global.is_whitespace = str.is_whitespace;
global.is_digit = str.is_digit;
global.to_int = str.to_int;
global.to_float = str.to_float;
global.from_int = str.from_int;
global.from_float = str.from_float;

require(${JSON.stringify(parserPath)});
`;

  return spawnSync('node', ['-e', script], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
};

let passed = 0;
let failed = 0;

for (const testCase of tests) {
  const result = runCase(testCase.input);
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const ok =
    result.status === 0 &&
    stdout.includes(testCase.expect) &&
    !stdout.includes('TypeError') &&
    !stderr.includes('Error');

  if (ok) {
    passed += 1;
    console.log(`PASS ${testCase.name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${testCase.name}`);
    if (stdout) console.log('  stdout:', stdout.trim());
    if (stderr) console.log('  stderr:', stderr.trim());
  }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
