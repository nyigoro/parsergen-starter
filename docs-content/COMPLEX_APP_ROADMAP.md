# Complex App Roadmap

This roadmap locks Lumina's next app-platform layer around shipped code, not
aspirational widgets. The current phase is to make complex apps predictable:
owned routes, scoped data, production SSR hooks, safe mutations, devtools,
testing, and large-app conventions.

## Phase 1: Route Ownership

Status: implemented and covered.

- `routeNode`, `routeNodeWithChildren`, and `routeTree` define route ownership.
- `routeNodeLayout`, `routeTreeView`, and `routeTreeBoundary` keep layout,
  loading, and error boundaries close to the route that owns them.
- `routeBoundary`, `routeBoundaryView`, and `routeOwnershipProps` lock reusable
  route-owned layout/loading/error/meta units.
- `routeNodeMeta` and `routeTreeMeta` carry route id, pattern, title, and app
  metadata for document head, analytics, and devtools.
- `lazyRouteModule`, `navigationIntentProps`, and `prefetchRouteNode` provide
  route-module delivery conventions.

## Phase 2: App Data Lifecycle

Status: implemented and covered.

- Route/resource keys include path and search so filtered views do not share
  stale data.
- `requestScope`, `scoped`, `routeDataPolicy`, `tag`, and `dependency` define
  public cache ownership.
- `requestPolicy`, `routeRequestPolicy`, and `createPrefetchResource` make
  request scope, stale-while-revalidate, and disabled prefetch records explicit.
- `requestRouteDataPolicy` carries SSR request identity without weakening route
  invalidation scope.
- `abortOnRefresh` and background refresh map to abortable loaders and
  stale-while-revalidate behavior.
- Prefetch helpers now preserve `?search` in route resource keys.

## Phase 3: SSR And Hydration

Status: implemented foundation, streaming/deferred depth remains evolving.

- `renderToChunks` and `renderToReadableStream` expose chunked SSR output.
- `hydrationOptions`, `requestOptions`, `deferredDataOptions`, `islandProps`,
  and `deferredHydrationProps` document the server/client handoff contract.
- Route and resource state should be serialized only after app render has run.

## Phase 4: Mutations And Forms

Status: implemented and covered.

- `submitAction` and `submitRouteAction` use runtime-backed submit helpers so
  `submitting` resets after success or rejection.
- `submitActionWithRollback` rolls optimistic resource state back when the
  action rejects.
- `submitActionWithCurrentRollback` uses the current resource value as the
  rollback baseline.
- `fileInputNamed`, `multipartProps`, `schemaAdapter`, `fieldArrayItemName`,
  and `applyServerValidation` are the first-class form workflow surface.
- `fieldControlProps`, `fieldErrorProps`, and `validationSummaryProps` carry
  accessible error wiring for server/client validation.

## Phase 5: Navigation And Delivery

Status: implemented as progressive enhancement.

- `supportsNavigationApi`, `supportsViewTransition`, and `supportsUrlPattern`
  detect modern browser primitives.
- `navigateWithTransition` uses View Transitions when available and falls back
  to normal navigation.
- `matchUrlPattern` uses URLPattern when present and falls back to Lumina route
  matching.
- Navigation API and View Transition API are optional layers, never hard
  requirements.

## Phase 6: Devtools, Testing, And Design System

Status: implemented foundation, inspector UI remains a future product layer.

- Devtools expose snapshots, timelines, inspector event records, hydration
  mismatch records, and profiler-style timing records.
- Testing exposes `flush`, `waitFor`, `settle`, find/query helpers, and
  interaction helpers for route/action/resource workflows.
- `waitFor` is promise-aware for async browser/e2e-style checks.
- `@std/ui` owns theme tokens, app shells, navigation, tables, fields, badges,
  variants, loading controls, sortable headers, and large-app composition
  conventions.

## Standards Floor

Lumina wraps these browser standards so app code gets safer defaults:

- [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData)
- [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
- [History.scrollRestoration](https://developer.mozilla.org/en-US/docs/Web/API/History/scrollRestoration)
- [Navigation API](https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API)
- [URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)
- [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/)

## Done Criteria

- Public APIs compile through the stdlib.
- Runtime helpers have focused tests.
- Docs name the shipped surface and mark progressive pieces clearly.
- `npm run verify` passes under the four-minute budget.
