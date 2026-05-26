import { defaultSettings } from '../src/lsp/config.js';

describe('LSP configuration defaults', () => {
  test('include the documented .lm extension', () => {
    expect(defaultSettings.fileExtensions).toEqual(expect.arrayContaining(['.lm', '.lum', '.lumina']));
  });
});
