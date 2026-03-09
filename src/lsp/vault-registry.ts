import { readLockfileSync, type LockfileEntry } from '../lumina/lockfile.js';
import {
  createStdModuleRegistry,
  type ModuleExport,
  type ModuleNamespace,
  type ModuleRegistry,
} from '../lumina/module-registry.js';

function normalizeLuminaExportName(name: string, packageName: string): string {
  if (name === '.') return packageName;
  if (name.startsWith('./')) return name.slice(2);
  return name;
}

function placeholderModule(name: string, moduleId: string): ModuleNamespace {
  return {
    kind: 'module',
    name,
    moduleId,
    exports: new Map<string, ModuleExport>(),
  };
}

export function inferExportsFromLockEntry(entry: LockfileEntry): Map<string, ModuleExport> {
  const exports = new Map<string, ModuleExport>();
  if (typeof entry.lumina === 'string' && entry.lumina.trim().length > 0) {
    exports.set(entry.name, placeholderModule(entry.name, `pkg://${entry.name}@${entry.version}#default`));
    return exports;
  }
  if (entry.lumina && typeof entry.lumina === 'object') {
    for (const key of Object.keys(entry.lumina)) {
      const exportName = normalizeLuminaExportName(key, entry.name);
      if (!exportName) continue;
      exports.set(exportName, placeholderModule(exportName, `pkg://${entry.name}@${entry.version}#${exportName}`));
    }
  }
  return exports;
}

export function buildVaultRegistry(
  workspaceRoot: string | null | undefined,
  baseRegistry: ModuleRegistry = createStdModuleRegistry()
): ModuleRegistry {
  const registry = new Map(baseRegistry);
  if (!workspaceRoot) return registry;
  try {
    const lockfile = readLockfileSync(workspaceRoot);
    for (const entry of lockfile.packages.values()) {
      registry.set(entry.name, {
        kind: 'module',
        name: entry.name,
        moduleId: `pkg://${entry.name}@${entry.version}`,
        exports: inferExportsFromLockEntry(entry),
      });
    }
  } catch {
    return registry;
  }
  return registry;
}
