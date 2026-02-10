const { spawn } = require('node:child_process');
const path = require('node:path');

const isWin = process.platform === 'win32';
const tsxBin = isWin ? 'node_modules/.bin/tsx.cmd' : 'node_modules/.bin/tsx';
const tsxPath = path.resolve(__dirname, '..', tsxBin);
const cliPath = path.resolve(__dirname, '..', 'src', 'bin', 'cli.ts');
const grammarPath = path.resolve(__dirname, '..', 'examples', 'math.peg');

const child = spawn(tsxPath, [cliPath, grammarPath, '--interactive'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', (data) => {
  output += data.toString();
});
child.stderr.on('data', (data) => {
  output += data.toString();
});

const commands = [
  '.test 1 + 2',
  '.exit',
];

child.stdin.write(commands.join('\n') + '\n');
child.stdin.end();

const timeout = setTimeout(() => {
  child.kill('SIGKILL');
  console.error('REPL smoke test timed out');
  console.error(output);
  process.exit(1);
}, 15000);

child.on('close', (code) => {
  clearTimeout(timeout);
  if (code !== 0) {
    console.error('REPL smoke test failed');
    console.error(output);
    process.exit(code ?? 1);
  }
  if (!/Parse successful|\"result\"/i.test(output)) {
    console.error('REPL smoke test did not detect parse output');
    console.error(output);
    process.exit(1);
  }
  console.log('REPL smoke test passed');
});
