import {
  LuminaCommands,
  type ChangeReturnTypeActionArg,
  type ChangeReturnTypePreview,
  type ChangeReturnTypeResult,
} from 'lumina-language-client';
import { getVscode } from '../vscode-shim.js';

type ExtensionContextLike = {
  subscriptions: { push: (...items: Array<{ dispose(): unknown }>) => unknown };
};

type LanguageClientLike = {
  sendRequest<T>(method: string, params: unknown): Promise<T>;
};

type EditorLike = {
  document: {
    uri: { toString(): string };
    languageId: string;
  };
  selection: { active: unknown };
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

async function findChangeReturnTypeArg(
  editor: EditorLike,
  explicit?: ChangeReturnTypeActionArg
): Promise<ChangeReturnTypeActionArg | null> {
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
    if (command?.command !== LuminaCommands.changeReturnType) continue;
    const arg = command.arguments?.[0] as ChangeReturnTypeActionArg | undefined;
    if (arg?.uri && arg?.position) return arg;
  }
  return null;
}

export async function registerChangeReturnTypeCommand(
  context: ExtensionContextLike,
  getClient: () => LanguageClientLike | undefined
): Promise<void> {
  const vscode = getVscode();
  context.subscriptions.push(
    vscode.commands.registerCommand(LuminaCommands.changeReturnType, async (...args: unknown[]) => {
      const arg = args[0] as ChangeReturnTypeActionArg | undefined;
      const client = getClient();
      const editor = vscode.window.activeTextEditor as EditorLike | undefined;
      if (!client || !editor || editor.document.languageId !== 'lumina') {
        void vscode.window.showWarningMessage('Open a Lumina file with the language server running to change a return type.');
        return;
      }

      const actionArg = await findChangeReturnTypeArg(editor, arg);
      if (!actionArg?.uri || !actionArg.position) {
        void vscode.window.showErrorMessage('No function declaration found at the current cursor position.');
        return;
      }

      const newReturnType = await vscode.window.showInputBox({
        title: `Change return type: ${actionArg.name ?? 'function'}`,
        prompt: 'Enter the new return type',
        value: actionArg.currentReturnType ?? '',
      });
      if (!newReturnType || !newReturnType.trim()) return;

      const preview = await client.sendRequest<ChangeReturnTypePreview>(
        'workspace/executeCommand',
        {
          command: LuminaCommands.previewChangeReturnType,
          arguments: [{ uri: actionArg.uri, position: actionArg.position }, newReturnType.trim()],
        }
      );
      if (preview?.error) {
        void vscode.window.showErrorMessage(preview.error);
        return;
      }

      const summary = `Updates ${preview?.callSiteCount ?? 0} call site(s) across ${preview?.fileCount ?? 0} file(s).`;
      const detail = preview?.warnings?.length ? ` ${preview.warnings[0]}` : '';
      const choice = await vscode.window.showInformationMessage(`${summary}${detail}`, 'Apply');
      if (choice !== 'Apply') return;

      const result = await client.sendRequest<ChangeReturnTypeResult>(
        'workspace/executeCommand',
        {
          command: LuminaCommands.applyChangeReturnType,
          arguments: [{ uri: actionArg.uri, position: actionArg.position }, newReturnType.trim()],
        }
      );
      if (!result?.ok) {
        void vscode.window.showErrorMessage(result?.error ?? 'Change return type failed.');
        return;
      }
      void vscode.window.showInformationMessage(
        `Return type updated — ${result.callSiteCount ?? 0} call site(s) across ${result.fileCount ?? 0} file(s).`
      );
    })
  );
}
