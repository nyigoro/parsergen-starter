export interface LuminaLspSettings {
  grammarPath?: string;
  maxDiagnostics?: number;
  enableTrace?: boolean;
  fileExtensions?: string[];
  maxIndexFiles?: number;
  renameConflictMode?: 'all' | 'exports';
  renamePreviewMode?: 'popup' | 'log' | 'off';
  useHmDiagnostics?: boolean;
}

export const defaultSettings: LuminaLspSettings = {
  grammarPath: undefined,
  maxDiagnostics: 200,
  enableTrace: false,
  fileExtensions: ['.lum', '.lumina'],
  maxIndexFiles: 2000,
  renameConflictMode: 'all',
  renamePreviewMode: 'popup',
  useHmDiagnostics: false,
};
