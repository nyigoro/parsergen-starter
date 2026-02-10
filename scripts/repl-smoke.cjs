const { spawn } = require('node:child_process');
const path = require('node:path');

const tsxCli = path.resolve(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cliPath = path.resolve(__dirname, '..', 'src', 'bin', 'cli.ts');
const grammarPath = path.resolve(__dirname, '..', 'examples', 'math.peg');

const child = spawn(process.execPath, [tsxCli, cliPath, grammarPath, '--interactive'], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let output = '';
let sent = false;
const newline = '\r\n';
let sentTest = false;
let sentExit = false;

const onData = (data) => {
  output += data.toString();
  if (!sentTest && output.includes('parsergen>')) {
    sentTest = true;
    child.stdin.write('.test 1 + 2' + newline);
  }
  if (!sentExit && /Parse error|Parse Error|\"type\"|\\{\\s*\"/i.test(output)) {
    sentExit = true;
    child.stdin.write('.exit' + newline);
    child.stdin.end();
  }
};

child.stdout.on('data', onData);
child.stderr.on('data', onData);

const timeout = setTimeout(() => {
  child.kill('SIGKILL');
  console.error('REPL smoke test timed out');
  console.error(output);
  process.exit(1);
}, 15000);

setTimeout(() => {
  if (!sentExit) {
    sentExit = true;
    child.stdin.write('.exit' + newline);
    child.stdin.end();
  }
}, 4000);

child.on('close', (code) => {
  clearTimeout(timeout);
  if (code !== 0) {
    console.error('REPL smoke test failed');
    console.error(output);
    process.exit(code ?? 1);
  }
  if (!/Parse error|Parse Error|\"type\"|\\{\\s*\"/i.test(output)) {
    console.error('REPL smoke test did not detect parse output');
    console.error(output);
    process.exit(1);
  }
  console.log('REPL smoke test passed');
});
