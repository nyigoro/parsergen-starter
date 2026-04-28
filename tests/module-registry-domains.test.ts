import fs from 'node:fs';
import path from 'node:path';
import {
  createStdCollectionsRegistryEntries,
  createStdCollectionsRootEntries,
  createStdConcurrencyRegistryEntries,
  createStdConcurrencyRootEntries,
  createStdFunctionalRegistryEntries,
  createStdFunctionalRootEntries,
  createStdSystemRegistryEntries,
  createStdSystemRootEntries,
  createStdUiRegistryEntries,
  createStdUiRootEntries,
  registerModuleRegistryEntries,
  type StdDomainModules,
} from '../src/lumina/module-registry-domains.js';
import { createStdModuleRegistry } from '../src/lumina/module-registry.js';

const makeModule = (name: string) => ({
  kind: 'module' as const,
  name,
  moduleId: `std://${name}`,
  exports: new Map(),
});

const modules = (): StdDomainModules => ({
  ioModule: makeModule('io'),
  fsModule: makeModule('fs'),
  opfsModule: makeModule('opfs'),
  urlModule: makeModule('url'),
  routerModule: makeModule('router'),
  webStorageModule: makeModule('web_storage'),
  domModule: makeModule('dom'),
  webWorkerModule: makeModule('web_worker'),
  webStreamsModule: makeModule('web_streams'),
  pathModule: makeModule('path'),
  envModule: makeModule('env'),
  processModule: makeModule('process'),
  jsonModule: makeModule('json'),
  httpModule: makeModule('http'),
  timeModule: makeModule('time'),
  asyncModule: makeModule('async_util'),
  regexModule: makeModule('regex'),
  cryptoModule: makeModule('crypto'),
  optionModule: makeModule('Option'),
  resultModule: makeModule('Result'),
  strModule: makeModule('str'),
  mathModule: makeModule('math'),
  listModule: makeModule('list'),
  vecModule: makeModule('vec'),
  iterModule: makeModule('iter'),
  queryModule: makeModule('query'),
  hashmapModule: makeModule('hashmap'),
  hashsetModule: makeModule('hashset'),
  dequeModule: makeModule('deque'),
  btreemapModule: makeModule('btreemap'),
  btreesetModule: makeModule('btreeset'),
  priorityQueueModule: makeModule('priority_queue'),
  channelModule: makeModule('channel'),
  asyncChannelModule: makeModule('async_channel'),
  sabChannelModule: makeModule('sab_channel'),
  threadModule: makeModule('thread'),
  syncModule: makeModule('sync'),
  webgpuModule: makeModule('webgpu'),
  reactiveModule: makeModule('reactive'),
  renderModule: makeModule('render'),
  functorModule: makeModule('functor'),
  applicativeModule: makeModule('applicative'),
  monadModule: makeModule('monad'),
  foldableModule: makeModule('foldable'),
  traversableModule: makeModule('traversable'),
});

describe('module registry domain helpers', () => {
  test('domain entry builders preserve expected std names', () => {
    const domainModules = modules();

    expect(createStdSystemRootEntries(domainModules).map(([name]) => name)).toEqual([
      'io', 'fs', 'opfs', 'url', 'router', 'web_storage', 'dom', 'web_worker',
      'web_streams', 'path', 'env', 'process', 'json', 'http', 'time', 'async_util', 'regex', 'crypto',
    ]);
    expect(createStdCollectionsRootEntries(domainModules).map(([name]) => name)).toContain('query');
    expect(createStdConcurrencyRootEntries(domainModules).map(([name]) => name)).toContain('sab_channel');
    expect(createStdUiRootEntries(domainModules).map(([name]) => name)).toEqual(['webgpu', 'reactive', 'render']);
    expect(createStdFunctionalRootEntries(domainModules).map(([name]) => name)).toEqual([
      'functor', 'applicative', 'monad', 'foldable', 'traversable',
    ]);
  });

  test('registry helper registers grouped std module aliases', () => {
    const domainModules = modules();
    const registry = new Map();
    registerModuleRegistryEntries(registry, [
      ...createStdSystemRegistryEntries(domainModules),
      ...createStdCollectionsRegistryEntries(domainModules),
      ...createStdConcurrencyRegistryEntries(domainModules),
      ...createStdUiRegistryEntries(domainModules),
      ...createStdFunctionalRegistryEntries(domainModules),
    ]);

    expect(registry.get('@std/render')).toBe(domainModules.renderModule);
    expect(registry.get('@std/reactive')).toBe(domainModules.reactiveModule);
    expect(registry.get('@std/router')).toBe(domainModules.routerModule);
    expect(registry.get('@std/query')).toBe(domainModules.queryModule);
    expect(registry.get('@std/sab_channel')).toBe(domainModules.sabChannelModule);
  });

  test('main module registry keeps the extracted std aliases available', () => {
    const registry = createStdModuleRegistry();

    expect(registry.has('@std/render')).toBe(true);
    expect(registry.has('@std/reactive')).toBe(true);
    expect(registry.has('@std/router')).toBe(true);
    expect(registry.has('@std/query')).toBe(true);
    expect(registry.has('@std/sab_channel')).toBe(true);
    expect(registry.get('@std')?.exports.get('render')).toBe(registry.get('@std/render'));
  });

  test('module-registry imports the extracted domain helper', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/lumina/module-registry.ts'), 'utf-8');
    expect(source).toContain("from './module-registry-domains.js'");
  });
});
