import type { StdDomainModules } from './module-registry-domains.js';
import { createStdSystemBrowserDomainModules } from './module-registry-system-browser.js';
import { createStdSystemIoDomainModules } from './module-registry-system-io.js';
import { createStdSystemRuntimeDomainModules } from './module-registry-system-runtime.js';

export function createStdSystemDomainModules(): Pick<
  StdDomainModules,
  | 'ioModule'
  | 'fsModule'
  | 'opfsModule'
  | 'urlModule'
  | 'routerModule'
  | 'webStorageModule'
  | 'domModule'
  | 'webWorkerModule'
  | 'webStreamsModule'
  | 'pathModule'
  | 'envModule'
  | 'processModule'
  | 'jsonModule'
  | 'httpModule'
  | 'timeModule'
  | 'asyncModule'
  | 'regexModule'
  | 'cryptoModule'
> {
  return {
    ...createStdSystemIoDomainModules(),
    ...createStdSystemBrowserDomainModules(),
    ...createStdSystemRuntimeDomainModules(),
  };
}
