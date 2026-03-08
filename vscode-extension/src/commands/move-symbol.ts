import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVscode, type VscodeLike } from '../vscode-shim.js';

type ExtensionContextLike = {
  subscriptions: { push: (...items: Array<{ dispose(): unknown }>) => unknown };
};

type LanguageClientLike = {
  sendRequest<T>(method: string, params: unknown): Promise<T>;
};

type MoveSymbolActionArg = {
  uri: string;
  position: { line: number; character: number };
  symbol?: string;
};

type EditorLike = {
  document: {
    uri: { toString(): string };
    languageId: string;
  };
  selection: { active: unknown };
};

type ApplyMoveSymbolResult = {
  ok: boolean;
  error?: string;
  symbolName?: string;
  targetUri?: string;
  newName?: string;
};

function directoryDistance(fromFile: string, toFile: string): number {
  const fromDirParts = path.dirname(fromFile).split(/[\\/]+/).filter(Boolean);
  const toDirParts = path.dirname(toFile).split(/[\\/]+/).filter(Boolean);
  let shared = 0;
  while (shared < fromDirParts.length && shared < toDirParts.length && fromDirParts[shared] === toDirParts[shared]) {
    shared += 1;
  }
  return (fromDirParts.length - shared) + (toDirParts.length - shared);
}

export function selectMoveTargetFiles(currentUri: string, candidateUris: string[]): string[] {
  const currentPath = fileURLToPath(currentUri);
  return candidateUris
    .filter((candidate) => candidate !== currentUri)
    .filter((candidate) => candidate.toLowerCase().endsWith('.lm'))
    .sort((left, right) => {
      const leftDistance = directoryDistance(currentPath, fileURLToPath(left));
      const rightDistance = directoryDistance(currentPath, fileURLToPath(right));
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      return fileURLToPath(left).localeCompare(fileURLToPath(right));
    });
}

function suggestRenamedSymbol(base: string, targetText: string): string {
  let index = 2;
  let candidate = `${base}${index}`;
  while (new RegExp(`\\b${candidate}\\b`).test(targetText)) {
    index += 1;
    candidate = `${base}${index}`;
  }
  return candidate;
}

function extractCodeActionCommand(item: unknown): { command?: string; arguments?: unknown[] } | null {
  if (!item || typeof item !== 'object' || !('command' in item)) return null;
  const candidate = (item as { command?: unknown }).command;
  if (!candidate || typeof candidate !== 'object' || !('command' in candidate)) return null;
  const command = candidate as { command?: unknown; arguments?: unknown[] };
  return typeof command.command === 'string'
    ? { command: command.command, arguments: command.arguments }
    : null;
}

async function findMoveActionArg(editor: EditorLike, explicit?: MoveSymbolActionArg): Promise<MoveSymbolActionArg | null> {
  if (explicit?.uri && explicit?.position) return explicit;
  const vscode = getVscode();
  const cursor = editor.selection.active;
  const range = new vscode.Range(cursor, cursor);
  const actions = await vscode.commands.executeCommand<unknown[]>(
    'vscode.executeCodeActionProvider',
    editor.document.uri,
    range,
    vscode.CodeActionKind.Refactor,
    50
  );
  for (const item of actions ?? []) {
    const command = extractCodeActionCommand(item);
    if (command?.command !== 'lumina.moveSymbol') continue;
    const arg = command.arguments?.[0] as MoveSymbolActionArg | undefined;
    if (arg?.uri && arg?.position) return arg;
  }
  return null;
}

async function applyMoveSymbol(
  client: LanguageClientLike,
  request: MoveSymbolActionArg & { targetUri: string; newName?: string }
): Promise<ApplyMoveSymbolResult> {
  const result = await client.sendRequest<ApplyMoveSymbolResult>('workspace/executeCommand', {
    command: 'lumina.applyMoveSymbol',
    arguments: [request],
  });
  return result ?? { ok: false, error: 'Move symbol did not return a result.' };
}

async function revealMovedSymbol(targetUri: string, symbolName: string): Promise<void> {
  const vscode = getVscode();
  const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(targetUri));
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  const match = new RegExp(`\\b${symbolName}\\b`).exec(document.getText());
  if (!match) return;
  const start = document.positionAt(match.index);
  const end = document.positionAt(match.index + symbolName.length);
  editor.selection = new vscode.Selection(start, end);
  editor.revealRange(new vscode.Range(start, end));
}

async function runMoveSymbol(
  vscode: VscodeLike,
  client: LanguageClientLike,
  editor: EditorLike,
  arg?: MoveSymbolActionArg
): Promise<void> {
  const actionArg = await findMoveActionArg(editor, arg);
  if (!actionArg?.uri || !actionArg.position) {
    void vscode.window.showErrorMessage('No movable top-level symbol found at the current cursor position.');
    return;
  }

  const files = await vscode.workspace.findFiles('**/*.lm', '**/{node_modules,.git,dist,build}/**');
  const ordered = selectMoveTargetFiles(editor.document.uri.toString(), files.map((file) => file.toString()));
  if (ordered.length === 0) {
    void vscode.window.showWarningMessage('No target Lumina files were found in the workspace.');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    ordered.map((uri) => ({
      label: vscode.workspace.asRelativePath(vscode.Uri.parse(uri)),
      description: uri,
      uri,
    })),
    {
      title: `Pick target file for '${actionArg.symbol ?? 'symbol'}'`,
      placeHolder: 'Select a destination .lm file',
    }
  );
  if (!picked) return;

  let result = await applyMoveSymbol(client, {
    ...actionArg,
    targetUri: picked.uri,
  });

  if (!result.ok && /already defines/.test(result.error ?? '') && actionArg.symbol) {
    const targetDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(picked.uri));
    const suggested = suggestRenamedSymbol(actionArg.symbol, targetDocument.getText());
    const choice = await vscode.window.showWarningMessage(
      result.error ?? `Target file already defines '${actionArg.symbol}'.`,
      'Cancel',
      `Move and rename to ${suggested}`
    );
    if (choice === `Move and rename to ${suggested}`) {
      result = await applyMoveSymbol(client, {
        ...actionArg,
        targetUri: picked.uri,
        newName: suggested,
      });
    } else {
      return;
    }
  }

  if (!result.ok) {
    void vscode.window.showErrorMessage(result.error ?? 'Move symbol failed.');
    return;
  }

  const movedName = result.newName ?? actionArg.symbol ?? 'symbol';
  const targetUri = result.targetUri ?? picked.uri;
  void vscode.window.showInformationMessage(`'${movedName}' moved to ${vscode.workspace.asRelativePath(vscode.Uri.parse(targetUri))}.`);
  await revealMovedSymbol(targetUri, movedName);
}

export async function registerMoveSymbolCommand(
  context: ExtensionContextLike,
  getClient: () => LanguageClientLike | undefined
): Promise<void> {
  const vscode = getVscode();
  context.subscriptions.push(
    vscode.commands.registerCommand('lumina.moveSymbol', async (...args: unknown[]) => {
      const arg = args[0] as MoveSymbolActionArg | undefined;
      const client = getClient();
      const editor = vscode.window.activeTextEditor as EditorLike | undefined;
      if (!client || !editor || editor.document.languageId !== 'lumina') {
        void vscode.window.showWarningMessage('Open a Lumina file with the language server running to move a symbol.');
        return;
      }
      await runMoveSymbol(vscode, client, editor, arg);
    })
  );
}
