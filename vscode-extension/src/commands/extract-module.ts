import path from 'node:path';
import { getVscode } from '../vscode-shim.js';

type ExtensionContextLike = {
  subscriptions: { push: (...items: Array<{ dispose(): unknown }>) => unknown };
};

type LanguageClientLike = {
  sendRequest<T>(method: string, params: unknown): Promise<T>;
};

type ExtractModuleActionArg = {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  symbols?: string[];
};

type EditorLike = {
  document: {
    uri: { toString(): string; fsPath?: string };
    languageId: string;
  };
  selection: { start: unknown; end: unknown; isEmpty?: boolean };
};

function extractCodeActionCommand(item: unknown): { command?: string; arguments?: unknown[] } | null {
  if (!item || typeof item !== 'object' || !('command' in item)) return null;
  const candidate = (item as { command?: unknown }).command;
  if (!candidate || typeof candidate !== 'object' || !('command' in candidate)) return null;
  const command = candidate as { command?: unknown; arguments?: unknown[] };
  return typeof command.command === 'string'
    ? { command: command.command, arguments: command.arguments }
    : null;
}

async function findExtractModuleArg(
  editor: EditorLike,
  explicit?: ExtractModuleActionArg
): Promise<ExtractModuleActionArg | null> {
  if (explicit?.uri && explicit?.range) return explicit;
  const vscode = getVscode();
  const range = new vscode.Range(editor.selection.start, editor.selection.end);
  const actions = await vscode.commands.executeCommand<unknown[]>(
    'vscode.executeCodeActionProvider',
    editor.document.uri,
    range,
    vscode.CodeActionKind.RefactorExtract,
    50
  );
  for (const item of actions ?? []) {
    const command = extractCodeActionCommand(item);
    if (command?.command !== 'lumina.extractModule') continue;
    const arg = command.arguments?.[0] as ExtractModuleActionArg | undefined;
    if (arg?.uri && arg?.range) return arg;
  }
  return null;
}

function resolveTargetPath(currentFsPath: string, rawInput: string): string {
  const candidate = rawInput.endsWith('.lm') ? rawInput : `${rawInput}.lm`;
  return path.isAbsolute(candidate) ? candidate : path.resolve(path.dirname(currentFsPath), candidate);
}

export async function registerExtractModuleCommand(
  context: ExtensionContextLike,
  getClient: () => LanguageClientLike | undefined
): Promise<void> {
  const vscode = getVscode();
  context.subscriptions.push(
    vscode.commands.registerCommand('lumina.extractModule', async (...args: unknown[]) => {
      const arg = args[0] as ExtractModuleActionArg | undefined;
      const client = getClient();
      const editor = vscode.window.activeTextEditor as EditorLike | undefined;
      if (!client || !editor || editor.document.languageId !== 'lumina') {
        void vscode.window.showWarningMessage('Open a Lumina file with the language server running to extract a module.');
        return;
      }

      const actionArg = await findExtractModuleArg(editor, arg);
      if (!actionArg?.uri || !actionArg.range) {
        void vscode.window.showErrorMessage('Select at least two top-level declarations to extract a module.');
        return;
      }

      const rawTarget = await vscode.window.showInputBox({
        title: 'Extract Module',
        prompt: 'Enter the new module path',
        value: 'extracted.lm',
      });
      if (!rawTarget || !rawTarget.trim()) return;
      const currentFsPath = editor.document.uri.fsPath ?? '';
      const targetFsPath = resolveTargetPath(currentFsPath, rawTarget.trim());
      const targetUri = vscode.Uri.file(targetFsPath).toString();

      const result = await client.sendRequest<{ ok?: boolean; error?: string; movedSymbols?: string[]; targetUri?: string }>(
        'workspace/executeCommand',
        {
          command: 'lumina.applyExtractModule',
          arguments: [{ uri: actionArg.uri, range: actionArg.range, targetUri }],
        }
      );
      if (!result?.ok) {
        void vscode.window.showErrorMessage(result?.error ?? 'Extract module failed.');
        return;
      }
      const opened = await vscode.workspace.openTextDocument(vscode.Uri.parse(result.targetUri ?? targetUri));
      await vscode.window.showTextDocument(opened, { preview: false });
      void vscode.window.showInformationMessage(
        `Extracted ${result.movedSymbols?.length ?? 0} declaration(s) to ${vscode.workspace.asRelativePath(vscode.Uri.parse(result.targetUri ?? targetUri))}.`
      );
    })
  );
}
