# Neovim Integration

## `nvim-lspconfig`

```lua
require('lspconfig').lumina = {
  default_config = {
    cmd = { 'npx', 'lumina-lsp', '--stdio' },
    filetypes = { 'lumina' },
    root_dir = require('lspconfig.util').root_pattern('lumina.toml'),
  },
}

require('lspconfig').lumina.setup({})
```

## File type detection

```lua
vim.filetype.add({ extension = { lm = 'lumina' } })
```

## Advanced refactors

Use `vim.lsp.buf.execute_command` with command ids from `docs/editor-integration/PROTOCOL.md`.
