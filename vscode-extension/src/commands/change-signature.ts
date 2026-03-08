import {
  LuminaCommands,
  type ChangeSignatureActionArg,
  type ChangeSignaturePreview,
  type ChangeSignatureResult,
} from 'lumina-language-client';
import { getVscode } from '../vscode-shim.js';
import {
  ChangeSignaturePanel,
  type ChangeSignaturePreviewInfo,
  type ParamChange,
  type ParamInfo,
} from '../panels/ChangeSignaturePanel.js';

type ExtensionContextLike = {
  subscriptions: { push: (...items: Array<{ dispose(): unknown }>) => unknown };
  extensionUri: unknown;
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

async function findChangeSignatureArg(
  editor: EditorLike,
  explicit?: ChangeSignatureActionArg
): Promise<ChangeSignatureActionArg | null> {
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
    if (command?.command !== LuminaCommands.changeSignature) continue;
    const arg = command.arguments?.[0] as ChangeSignatureActionArg | undefined;
    if (arg?.uri && arg?.position) return arg;
  }
  return null;
}

function toPanelParams(params: Array<{ name: string; type: string | null }> | undefined): ParamInfo[] {
  return (params ?? []).map((param, index) => ({ id: `param-${index}`, name: param.name, type: param.type }));
}

async function previewChangeSignature(
  client: LanguageClientLike,
  request: { uri: string; position: { line: number; character: number } },
  changes: ParamChange[],
  command: typeof LuminaCommands.previewChangeSignature | typeof LuminaCommands.previewChangeTraitSignature
): Promise<ChangeSignaturePreviewInfo> {
  const result = await client.sendRequest<ChangeSignaturePreview>('workspace/executeCommand', {
    command,
    arguments: [request, changes],
  });
  if (!result || result.error) {
    return { callSiteCount: 0, fileCount: 0, warnings: result?.error ? [result.error] : ['Preview unavailable'] };
  }
  return result;
}

async function applyChangeSignature(
  client: LanguageClientLike,
  request: { uri: string; position: { line: number; character: number } },
  changes: ParamChange[],
  command: typeof LuminaCommands.applyChangeSignature | typeof LuminaCommands.applyChangeTraitSignature
): Promise<{ success: boolean; message: string }> {
  const result = await client.sendRequest<ChangeSignatureResult>('workspace/executeCommand', {
    command,
    arguments: [request, changes],
  });
  if (!result?.ok) {
    return { success: false, message: result?.error ?? 'Change signature failed.' };
  }
  return {
    success: true,
    message: `Signature updated — ${result.callSiteCount ?? 0} call site(s) across ${result.fileCount ?? 0} file(s).`,
  };
}

export async function registerChangeSignatureCommand(
  context: ExtensionContextLike,
  getClient: () => LanguageClientLike | undefined
): Promise<void> {
  const vscode = getVscode();
  context.subscriptions.push(
    vscode.commands.registerCommand(LuminaCommands.changeSignature, async (...args: unknown[]) => {
      const arg = args[0] as ChangeSignatureActionArg | undefined;
      const client = getClient();
      const editor = vscode.window.activeTextEditor as EditorLike | undefined;
      if (!client || !editor || editor.document.languageId !== 'lumina') {
        void vscode.window.showWarningMessage('Open a Lumina file with the language server running to change a signature.');
        return;
      }

      const actionArg = await findChangeSignatureArg(editor, arg);
      if (!actionArg?.uri || !actionArg.position) {
        void vscode.window.showErrorMessage('No function declaration found at the current cursor position.');
        return;
      }

      const previewCommand =
        actionArg.kind === 'trait-method' ? LuminaCommands.previewChangeTraitSignature : LuminaCommands.previewChangeSignature;
      const applyCommand =
        actionArg.kind === 'trait-method' ? LuminaCommands.applyChangeTraitSignature : LuminaCommands.applyChangeSignature;
      const panelTitle =
        actionArg.kind === 'trait-method' && actionArg.traitName
          ? `${actionArg.traitName}.${actionArg.name ?? 'method'}`
          : actionArg.name ?? 'function';

      ChangeSignaturePanel.createOrShow(context, panelTitle, toPanelParams(actionArg.params), {
        onPreview: (changes) =>
          previewChangeSignature(client, { uri: actionArg.uri, position: actionArg.position }, changes, previewCommand),
        onConfirm: async (changes) => {
          const result = await applyChangeSignature(
            client,
            { uri: actionArg.uri, position: actionArg.position },
            changes,
            applyCommand
          );
          if (result.success) {
            void vscode.window.showInformationMessage(result.message);
          }
          return result;
        },
      });
    })
  );
}
