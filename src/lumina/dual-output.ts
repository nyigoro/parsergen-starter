export type DualOutputResult = {
  esm: string;
  cjs: string;
  packageJson: string;
};

type BuildDualOutputOptions = {
  buildTarget: (target: 'esm' | 'cjs') => string;
  esmEntryName?: string;
  cjsEntryName?: string;
  typesPath?: string;
};

export function generateExportsMap(
  esmEntryName: string = 'index.js',
  cjsEntryName: string = 'index.cjs',
  typesPath: string = './esm/index.d.ts'
): string {
  return `${JSON.stringify(
    {
      type: 'module',
      main: `./cjs/${cjsEntryName}`,
      module: `./esm/${esmEntryName}`,
      types: typesPath,
      exports: {
        '.': {
          import: `./esm/${esmEntryName}`,
          require: `./cjs/${cjsEntryName}`,
          types: typesPath,
        },
      },
    },
    null,
    2
  )}\n`;
}

export function buildDualOutput(_source: string, options: BuildDualOutputOptions): DualOutputResult {
  return {
    esm: options.buildTarget('esm'),
    cjs: options.buildTarget('cjs'),
    packageJson: generateExportsMap(
      options.esmEntryName ?? 'index.js',
      options.cjsEntryName ?? 'index.cjs',
      options.typesPath ?? './esm/index.d.ts'
    ),
  };
}
