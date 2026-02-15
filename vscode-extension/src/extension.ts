import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  State,
  TransportKind,
} from 'vscode-languageclient/node';

type ResolvedExecutable = {
  command: string;
  args: string[];
  label: string;
  cwd?: string;
  debugArgs?: string[];
};

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let lastServerExec: ResolvedExecutable | undefined;
let extensionContextRef: vscode.ExtensionContext | undefined;

const SERVER_COMMAND = 'lumina-lsp';
const CLI_COMMAND = 'lumina';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContextRef = context;
  outputChannel = vscode.window.createOutputChannel('Lumina');
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'lumina.showServerOutput';
  statusBar.text = '$(sync~spin) Lumina';
  statusBar.tooltip = 'Lumina Language Server: starting';
  statusBar.show();

  context.subscriptions.push(outputChannel, statusBar);

  context.subscriptions.push(
    vscode.commands.registerCommand('lumina.restartLanguageServer', async () => {
      await restartLanguageServer();
    }),
    vscode.commands.registerCommand('lumina.showServerOutput', () => {
      outputChannel?.show(true);
    }),
    vscode.commands.registerCommand('lumina.compileCurrentFile', async () => {
      await compileCurrentFile();
    }),
    vscode.commands.registerCommand('lumina.runCurrentFile', async () => {
      await runCurrentFile();
    }),
    vscode.commands.registerCommand('lumina.formatCurrentFile', async () => {
      await formatCurrentFile();
    }),
    vscode.commands.registerCommand('lumina.doctor', async () => {
      await showDoctorReport();
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (
        event.affectsConfiguration('lumina.server.path') ||
        event.affectsConfiguration('lumina.server.args')
      ) {
        await restartLanguageServer();
      }
    })
  );

  await startLanguageServer(context);
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}

async function restartLanguageServer(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
  if (extensionContextRef) {
    await startLanguageServer(extensionContextRef);
  } else {
    updateStatus('stopped');
  }
}

async function startLanguageServer(context: vscode.ExtensionContext): Promise<void> {
  updateStatus('starting');
  const executable = resolveServerExecutable();
  lastServerExec = executable;
  const run: ServerOptions = {
    command: executable.command,
    args: executable.args,
    options: { cwd: executable.cwd, env: process.env },
    transport: TransportKind.stdio,
  };
  const debug: ServerOptions = {
    command: executable.command,
    args: executable.debugArgs ?? executable.args,
    options: { cwd: executable.cwd, env: process.env },
    transport: TransportKind.stdio,
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'lumina' },
      { scheme: 'untitled', language: 'lumina' },
    ],
    outputChannel,
    synchronize: {
      configurationSection: 'lumina',
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{lum,lumina,lm}'),
    },
    diagnosticCollectionName: 'lumina',
  };

  client = new LanguageClient('lumina', 'Lumina Language Server', { run, debug }, clientOptions);
  await client.start();
  context.subscriptions.push({
    dispose: () => {
      if (client) {
        void client.stop();
      }
    },
  });

  client.onDidChangeState((event) => {
    if (event.newState === State.Running) {
      updateStatus('running');
    } else if (event.newState === State.Stopped) {
      updateStatus('stopped');
    } else {
      updateStatus('starting');
    }
  });

  outputChannel?.appendLine(`[lumina] LSP started via ${executable.label}`);
}

function updateStatus(state: 'starting' | 'running' | 'stopped'): void {
  if (!statusBar) return;
  if (state === 'starting') {
    statusBar.text = '$(sync~spin) Lumina';
    statusBar.tooltip = 'Lumina Language Server: starting';
    return;
  }
  if (state === 'running') {
    statusBar.text = '$(check) Lumina';
    statusBar.tooltip = lastServerExec
      ? `Lumina Language Server: running (${lastServerExec.label})`
      : 'Lumina Language Server: running';
    return;
  }
  statusBar.text = '$(error) Lumina';
  statusBar.tooltip = 'Lumina Language Server: stopped';
}

function resolveServerExecutable(): ResolvedExecutable {
  const config = vscode.workspace.getConfiguration('lumina');
  const configuredPath = config.get<string>('server.path')?.trim();
  const configuredArgs = config.get<string[]>('server.args') ?? [];
  const workspaceRoots = getWorkspaceRoots();

  if (configuredPath) {
    const resolved = resolveBinaryOrScript(configuredPath, configuredArgs, workspaceRoots);
    if (resolved) return { ...resolved, label: `configured:${configuredPath}` };
  }

  for (const root of workspaceRoots) {
    const serverScript = path.join(root, 'dist', 'bin', 'lumina-lsp.js');
    if (fs.existsSync(serverScript)) {
      return {
        command: process.execPath,
        args: [serverScript, ...configuredArgs],
        debugArgs: ['--inspect=6010', serverScript, ...configuredArgs],
        cwd: root,
        label: `workspace:${serverScript}`,
      };
    }
    const bin = resolveNodeBin(root, SERVER_COMMAND);
    if (bin) {
      return {
        command: bin,
        args: configuredArgs,
        cwd: root,
        label: `workspace:${bin}`,
      };
    }
  }

  return {
    command: SERVER_COMMAND,
    args: configuredArgs,
    label: `PATH:${SERVER_COMMAND}`,
  };
}

function resolveCliExecutable(): ResolvedExecutable {
  const config = vscode.workspace.getConfiguration('lumina');
  const configuredPath = config.get<string>('cli.path')?.trim();
  const configuredArgs = config.get<string[]>('cli.args') ?? [];
  const workspaceRoots = getWorkspaceRoots();

  if (configuredPath) {
    const resolved = resolveBinaryOrScript(configuredPath, configuredArgs, workspaceRoots);
    if (resolved) return { ...resolved, label: `configured:${configuredPath}` };
  }

  for (const root of workspaceRoots) {
    const cliScript = path.join(root, 'dist', 'bin', 'lumina.js');
    if (fs.existsSync(cliScript)) {
      return {
        command: process.execPath,
        args: [cliScript, ...configuredArgs],
        cwd: root,
        label: `workspace:${cliScript}`,
      };
    }
    const bin = resolveNodeBin(root, CLI_COMMAND);
    if (bin) {
      return {
        command: bin,
        args: configuredArgs,
        cwd: root,
        label: `workspace:${bin}`,
      };
    }
  }

  return {
    command: CLI_COMMAND,
    args: configuredArgs,
    label: `PATH:${CLI_COMMAND}`,
  };
}

function resolveBinaryOrScript(
  rawPath: string,
  baseArgs: string[],
  workspaceRoots: string[]
): Omit<ResolvedExecutable, 'label'> | null {
  const candidate = path.isAbsolute(rawPath)
    ? rawPath
    : resolveRelativeToWorkspace(rawPath, workspaceRoots) ?? path.resolve(rawPath);
  if (!fs.existsSync(candidate)) return null;
  if (/\.(cjs|mjs|js)$/i.test(candidate)) {
    return {
      command: process.execPath,
      args: [candidate, ...baseArgs],
      debugArgs: ['--inspect=6010', candidate, ...baseArgs],
      cwd: path.dirname(candidate),
    };
  }
  return {
    command: candidate,
    args: baseArgs,
    cwd: path.dirname(candidate),
  };
}

function resolveRelativeToWorkspace(relPath: string, roots: string[]): string | null {
  for (const root of roots) {
    const candidate = path.resolve(root, relPath);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveNodeBin(root: string, binName: string): string | null {
  const candidates =
    process.platform === 'win32'
      ? [path.join(root, 'node_modules', '.bin', `${binName}.cmd`), path.join(root, 'node_modules', '.bin', `${binName}.ps1`)]
      : [path.join(root, 'node_modules', '.bin', binName)];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getWorkspaceRoots(): string[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.map((folder) => folder.uri.fsPath);
}

function getActiveLuminaFilePath(): string | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const doc = editor.document;
  if (doc.languageId !== 'lumina' || doc.uri.scheme !== 'file') return null;
  return doc.uri.fsPath;
}

async function compileCurrentFile(): Promise<void> {
  const filePath = getActiveLuminaFilePath();
  if (!filePath) {
    vscode.window.showWarningMessage('Open a Lumina file to compile.');
    return;
  }
  await vscode.window.activeTextEditor?.document.save();

  const config = vscode.workspace.getConfiguration('lumina');
  const target = config.get<'esm' | 'cjs' | 'wasm'>('compile.target', 'esm');
  const astJs = config.get<boolean>('compile.astJs', true);
  const outPath = filePath.replace(/\.(lum|lumina|lm)$/i, target === 'wasm' ? '.wat' : '.js');
  const args = ['compile', filePath, '-o', outPath, '--target', target];
  if (astJs && target !== 'wasm') args.push('--ast-js');

  const result = await runLuminaCli(args);
  if (result.ok) {
    vscode.window.showInformationMessage(`Lumina compiled: ${outPath}`);
  } else {
    vscode.window.showErrorMessage('Lumina compile failed. See Lumina output for details.');
  }
}

async function runCurrentFile(): Promise<void> {
  const filePath = getActiveLuminaFilePath();
  if (!filePath) {
    vscode.window.showWarningMessage('Open a Lumina file to run.');
    return;
  }
  await vscode.window.activeTextEditor?.document.save();
  const outPath = filePath.replace(/\.(lum|lumina|lm)$/i, '.js');
  const compile = await runLuminaCli(['compile', filePath, '-o', outPath, '--target', 'esm', '--ast-js']);
  if (!compile.ok) {
    vscode.window.showErrorMessage('Lumina compile failed. See Lumina output for details.');
    return;
  }
  const run = await runCommand(process.execPath, [outPath], path.dirname(filePath), 'node');
  if (!run.ok) {
    vscode.window.showErrorMessage('Lumina run failed. See Lumina output for details.');
  }
}

async function formatCurrentFile(): Promise<void> {
  const filePath = getActiveLuminaFilePath();
  if (!filePath) {
    vscode.window.showWarningMessage('Open a Lumina file to format.');
    return;
  }
  await vscode.window.activeTextEditor?.document.save();
  const result = await runLuminaCli(['fmt', filePath]);
  if (result.ok) {
    await vscode.window.activeTextEditor?.document.save();
    vscode.window.showInformationMessage('Lumina format completed.');
  } else {
    vscode.window.showErrorMessage('Lumina format failed. See Lumina output for details.');
  }
}

async function runLuminaCli(args: string[]): Promise<{ ok: boolean; code: number | null }> {
  const executable = resolveCliExecutable();
  const finalArgs = [...executable.args, ...args];
  outputChannel?.appendLine(`[lumina] ${executable.command} ${finalArgs.join(' ')}`);
  return runCommand(executable.command, finalArgs, executable.cwd, executable.label);
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string | undefined,
  label: string
): Promise<{ ok: boolean; code: number | null }> {
  return new Promise((resolve) => {
    const child = cp.spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && /\.cmd$/i.test(command),
    });
    child.stdout.on('data', (chunk) => outputChannel?.append(chunk.toString()));
    child.stderr.on('data', (chunk) => outputChannel?.append(chunk.toString()));
    child.on('error', (err) => {
      outputChannel?.appendLine(`[lumina] Failed to run ${label}: ${String(err)}`);
      outputChannel?.show(true);
      resolve({ ok: false, code: null });
    });
    child.on('close', (code) => {
      outputChannel?.appendLine(`[lumina] ${label} exited with code ${String(code)}`);
      resolve({ ok: code === 0, code });
    });
  });
}

async function showDoctorReport(): Promise<void> {
  const server = resolveServerExecutable();
  const cli = resolveCliExecutable();
  const roots = getWorkspaceRoots();
  const report = [
    `Lumina VS Code Doctor`,
    `Node: ${process.execPath}`,
    `Workspace roots: ${roots.length > 0 ? roots.join(', ') : '(none)'}`,
    `Server: ${server.command} ${server.args.join(' ')} [${server.label}]`,
    `CLI: ${cli.command} ${cli.args.join(' ')} [${cli.label}]`,
  ].join('\n');
  outputChannel?.appendLine(report);
  outputChannel?.show(true);
  const action = await vscode.window.showInformationMessage('Lumina doctor report generated.', 'Show Output');
  if (action === 'Show Output') outputChannel?.show(true);
}
