import type { StdDomainModules } from './module-registry-domains.js';
import { createStdCollectionsAlgebraicDomainModules } from './module-registry-collections-algebraic.js';
import { createStdCollectionsAssocDomainModules } from './module-registry-collections-assoc.js';
import { createStdCollectionsPipelineDomainModules } from './module-registry-collections-pipeline.js';
import { createStdCollectionsScalarsDomainModules } from './module-registry-collections-scalars.js';
import { createStdCollectionsSequencesDomainModules } from './module-registry-collections-sequences.js';

export function createStdCollectionsDomainModules(): Pick<
  StdDomainModules,
  | 'optionModule'
  | 'resultModule'
  | 'strModule'
  | 'mathModule'
  | 'listModule'
  | 'vecModule'
  | 'iterModule'
  | 'queryModule'
  | 'hashmapModule'
  | 'hashsetModule'
  | 'dequeModule'
  | 'btreemapModule'
  | 'btreesetModule'
  | 'priorityQueueModule'
> {
  return {
    ...createStdCollectionsScalarsDomainModules(),
    ...createStdCollectionsSequencesDomainModules(),
    ...createStdCollectionsAssocDomainModules(),
    ...createStdCollectionsAlgebraicDomainModules(),
    ...createStdCollectionsPipelineDomainModules(),
  };
}
