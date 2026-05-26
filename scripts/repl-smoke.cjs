const { spawn } = require('node:child_process');
const path = require('node:path');

const tsxCli = path.resolve(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const cliPath = path.resolve(__dirname, '..', 'src', 'bin', 'lumina-repl.ts');

const child = spawn(process.execPath, [tsxCli, cliPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
});

let output = '';
const newline = '\r\n';
let sentTest = false;
let sentExit = false;

const writeLine = (line) => {
  if (child.stdin.destroyed || child.stdin.writableEnded) return;
  child.stdin.write(line + newline);
};

const closeInput = () => {
  if (child.stdin.destroyed || child.stdin.writableEnded) return;
  child.stdin.end();
};

const onData = (data) => {
  output += data.toString();
  if (!sentTest && output.includes('lumina>')) {
    sentTest = true;
    writeLine('1 + 2');
  }
  if (!sentExit && /=>\s+3\s+:\s+i32/i.test(output)) {
    sentExit = true;
    writeLine(':exit');
    closeInput();
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
    writeLine(':exit');
    closeInput();
  }
}, 4000);

child.on('close', (code) => {
  clearTimeout(timeout);
  if (code !== 0) {
    console.error('REPL smoke test failed');
    console.error(output);
    process.exit(code ?? 1);
  }
  if (!/=>\s+3\s+:\s+i32/i.test(output)) {
    console.error('REPL smoke test did not detect Lumina evaluation output');
    console.error(output);
    process.exit(1);
  }
  console.log('REPL smoke test passed');
});
