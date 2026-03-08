export type VscodeLike = {
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): { dispose(): unknown };
    executeCommand<T>(command: string, ...args: unknown[]): Promise<T>;
  };
  window: {
    activeTextEditor?: {
      document: {
        uri: { toString(): string };
        languageId: string;
      };
      selection: { active: unknown };
      viewColumn?: unknown;
      revealRange(range: unknown): void;
    };
    showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>;
    showErrorMessage(message: string, ...items: string[]): Promise<string | undefined>;
    showInformationMessage(message: string, ...items: string[]): Promise<string | undefined>;
    showQuickPick<T extends { label: string }>(items: readonly T[] | Promise<readonly T[]>, options?: { title?: string; placeHolder?: string }): Promise<T | undefined>;
    showTextDocument(document: {
      getText(): string;
      positionAt(offset: number): unknown;
    }, options?: { preview?: boolean }): Promise<{
      selection: unknown;
      revealRange(range: unknown): void;
    }>;
    createWebviewPanel(...args: unknown[]): unknown;
  };
  workspace: {
    findFiles(glob: string, exclude?: string): Promise<Array<{ toString(): string }>>;
    asRelativePath(pathOrUri: { toString(): string } | string): string;
    openTextDocument(uri: { toString(): string }): Promise<{
      getText(): string;
      positionAt(offset: number): unknown;
    }>;
  };
  Range: new (start: unknown, end: unknown) => unknown;
  Selection: new (start: unknown, end: unknown) => unknown;
  Uri: { parse(value: string): { toString(): string } };
  CodeActionKind: { Refactor: unknown };
  ViewColumn: { Active: unknown };
};

export function getVscode(): VscodeLike {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('vscode') as VscodeLike;
}
