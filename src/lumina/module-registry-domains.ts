import type { ModuleExport, ModuleNamespace, ModuleRegistry } from './module-registry.js';

export type ModuleRegistryEntry = readonly [string, ModuleNamespace];
export type ModuleRootEntry = readonly [string, ModuleExport];

export interface StdDomainModules {
  ioModule: ModuleNamespace;
  fsModule: ModuleNamespace;
  opfsModule: ModuleNamespace;
  urlModule: ModuleNamespace;
  routerModule: ModuleNamespace;
  webStorageModule: ModuleNamespace;
  domModule: ModuleNamespace;
  webWorkerModule: ModuleNamespace;
  webStreamsModule: ModuleNamespace;
  pathModule: ModuleNamespace;
  envModule: ModuleNamespace;
  processModule: ModuleNamespace;
  jsonModule: ModuleNamespace;
  httpModule: ModuleNamespace;
  timeModule: ModuleNamespace;
  asyncModule: ModuleNamespace;
  regexModule: ModuleNamespace;
  cryptoModule: ModuleNamespace;
  optionModule: ModuleNamespace;
  resultModule: ModuleNamespace;
  strModule: ModuleNamespace;
  mathModule: ModuleNamespace;
  listModule: ModuleNamespace;
  vecModule: ModuleNamespace;
  iterModule: ModuleNamespace;
  queryModule: ModuleNamespace;
  hashmapModule: ModuleNamespace;
  hashsetModule: ModuleNamespace;
  dequeModule: ModuleNamespace;
  btreemapModule: ModuleNamespace;
  btreesetModule: ModuleNamespace;
  priorityQueueModule: ModuleNamespace;
  channelModule: ModuleNamespace;
  asyncChannelModule: ModuleNamespace;
  sabChannelModule: ModuleNamespace;
  threadModule: ModuleNamespace;
  syncModule: ModuleNamespace;
  webgpuModule: ModuleNamespace;
  reactiveModule: ModuleNamespace;
  renderModule: ModuleNamespace;
  functorModule: ModuleNamespace;
  applicativeModule: ModuleNamespace;
  monadModule: ModuleNamespace;
  foldableModule: ModuleNamespace;
  traversableModule: ModuleNamespace;
}

export const createStdSystemRootEntries = (modules: StdDomainModules): ModuleRootEntry[] => [
  ['io', modules.ioModule],
  ['fs', modules.fsModule],
  ['opfs', modules.opfsModule],
  ['url', modules.urlModule],
  ['router', modules.routerModule],
  ['web_storage', modules.webStorageModule],
  ['dom', modules.domModule],
  ['web_worker', modules.webWorkerModule],
  ['web_streams', modules.webStreamsModule],
  ['path', modules.pathModule],
  ['env', modules.envModule],
  ['process', modules.processModule],
  ['json', modules.jsonModule],
  ['http', modules.httpModule],
  ['time', modules.timeModule],
  ['async_util', modules.asyncModule],
  ['regex', modules.regexModule],
  ['crypto', modules.cryptoModule],
];

export const createStdSystemRegistryEntries = (modules: StdDomainModules): ModuleRegistryEntry[] => [
  ['@std/io', modules.ioModule],
  ['@std/fs', modules.fsModule],
  ['@std/opfs', modules.opfsModule],
  ['@std/url', modules.urlModule],
  ['@std/router', modules.routerModule],
  ['@std/web_storage', modules.webStorageModule],
  ['@std/dom', modules.domModule],
  ['@std/web_worker', modules.webWorkerModule],
  ['@std/web_streams', modules.webStreamsModule],
  ['@std/path', modules.pathModule],
  ['@std/env', modules.envModule],
  ['@std/process', modules.processModule],
  ['@std/json', modules.jsonModule],
  ['@std/http', modules.httpModule],
  ['@std/time', modules.timeModule],
  ['@std/async', modules.asyncModule],
  ['@std/async_util', modules.asyncModule],
  ['@std/regex', modules.regexModule],
  ['@std/crypto', modules.cryptoModule],
];

export const createStdCollectionsRootEntries = (modules: StdDomainModules): ModuleRootEntry[] => [
  ['Option', modules.optionModule],
  ['Result', modules.resultModule],
  ['str', modules.strModule],
  ['math', modules.mathModule],
  ['list', modules.listModule],
  ['vec', modules.vecModule],
  ['iter', modules.iterModule],
  ['query', modules.queryModule],
  ['hashmap', modules.hashmapModule],
  ['hashset', modules.hashsetModule],
  ['deque', modules.dequeModule],
  ['btreemap', modules.btreemapModule],
  ['btreeset', modules.btreesetModule],
  ['priority_queue', modules.priorityQueueModule],
];

export const createStdCollectionsRegistryEntries = (modules: StdDomainModules): ModuleRegistryEntry[] => [
  ['@std/Option', modules.optionModule],
  ['@std/Result', modules.resultModule],
  ['@std/str', modules.strModule],
  ['@std/math', modules.mathModule],
  ['@std/list', modules.listModule],
  ['@std/vec', modules.vecModule],
  ['@std/iter', modules.iterModule],
  ['@std/query', modules.queryModule],
  ['@std/hashmap', modules.hashmapModule],
  ['@std/hashset', modules.hashsetModule],
  ['@std/deque', modules.dequeModule],
  ['@std/btreemap', modules.btreemapModule],
  ['@std/btreeset', modules.btreesetModule],
  ['@std/priority_queue', modules.priorityQueueModule],
];

export const createStdConcurrencyRootEntries = (modules: StdDomainModules): ModuleRootEntry[] => [
  ['channel', modules.channelModule],
  ['async_channel', modules.asyncChannelModule],
  ['sab_channel', modules.sabChannelModule],
  ['thread', modules.threadModule],
  ['sync', modules.syncModule],
];

export const createStdConcurrencyRegistryEntries = (modules: StdDomainModules): ModuleRegistryEntry[] => [
  ['@std/channel', modules.channelModule],
  ['@std/async_channel', modules.asyncChannelModule],
  ['@std/sab_channel', modules.sabChannelModule],
  ['@std/thread', modules.threadModule],
  ['@std/sync', modules.syncModule],
];

export const createStdUiRootEntries = (modules: StdDomainModules): ModuleRootEntry[] => [
  ['webgpu', modules.webgpuModule],
  ['reactive', modules.reactiveModule],
  ['render', modules.renderModule],
];

export const createStdUiRegistryEntries = (modules: StdDomainModules): ModuleRegistryEntry[] => [
  ['@std/webgpu', modules.webgpuModule],
  ['@std/reactive', modules.reactiveModule],
  ['@std/render', modules.renderModule],
];

export const createStdFunctionalRootEntries = (modules: StdDomainModules): ModuleRootEntry[] => [
  ['functor', modules.functorModule],
  ['applicative', modules.applicativeModule],
  ['monad', modules.monadModule],
  ['foldable', modules.foldableModule],
  ['traversable', modules.traversableModule],
];

export const createStdFunctionalRegistryEntries = (modules: StdDomainModules): ModuleRegistryEntry[] => [
  ['@std/functor', modules.functorModule],
  ['@std/applicative', modules.applicativeModule],
  ['@std/monad', modules.monadModule],
  ['@std/foldable', modules.foldableModule],
  ['@std/traversable', modules.traversableModule],
];

export const registerModuleRegistryEntries = (
  registry: ModuleRegistry,
  entries: readonly ModuleRegistryEntry[]
): void => {
  for (const [specifier, moduleNamespace] of entries) {
    registry.set(specifier, moduleNamespace);
  }
};
