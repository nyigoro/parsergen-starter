import type { StdDomainModules } from './module-registry-domains.js';
import { createStdUiReactiveDomainModules } from './module-registry-ui-reactive.js';
import { createStdUiRenderDomainModules } from './module-registry-ui-render.js';
import { createStdUiWebgpuDomainModules } from './module-registry-ui-webgpu.js';

export function createStdUiDomainModules(): Pick<
  StdDomainModules,
  'webgpuModule' | 'reactiveModule' | 'renderModule'
> {
  return {
    ...createStdUiWebgpuDomainModules(),
    ...createStdUiRenderDomainModules(),
    ...createStdUiReactiveDomainModules(),
  };
}
