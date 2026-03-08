export const LuminaCommands = {
  changeSignature: 'lumina.changeSignature',
  previewChangeSignature: 'lumina.previewChangeSignature',
  applyChangeSignature: 'lumina.applyChangeSignature',
  previewChangeTraitSignature: 'lumina.previewChangeTraitSignature',
  applyChangeTraitSignature: 'lumina.applyChangeTraitSignature',
  moveSymbol: 'lumina.moveSymbol',
  applyMoveSymbol: 'lumina.applyMoveSymbol',
  changeReturnType: 'lumina.changeReturnType',
  previewChangeReturnType: 'lumina.previewChangeReturnType',
  applyChangeReturnType: 'lumina.applyChangeReturnType',
  extractModule: 'lumina.extractModule',
  applyExtractModule: 'lumina.applyExtractModule',
  explainDiagnostic: 'lumina.explain',
} as const;

export type LuminaCommandId = typeof LuminaCommands[keyof typeof LuminaCommands];
