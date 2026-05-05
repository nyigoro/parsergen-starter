# Large App Architecture

Lumina large apps use explicit ownership boundaries instead of hidden framework
magic. Keep route tree, data lifecycle, mutations, SSR handoff, testing, and UI
tokens close to the code that owns them.

## Route Ownership

- Declare route modules with `routeNode` or `routeNodeWithChildren`.
- Wrap the root ownership contract in `routeTree`.
- Use `routeBoundary` when a route owns layout, loading, error, and meta as a
  reusable unit.
- Use `routeLayout` when a route owns a shell function plus loading/error/meta
  as a first-class module boundary.
- Keep layout ownership in `routeNodeLayout`.
- Keep route loaders/actions on the same node with `routeNodeLoader` and
  `routeNodeAction`.
- Use `routeOwnershipProps`, `routeNodeMeta`, and `routeTreeMeta` for
  head/meta/devtools ownership.
- Use `lazyRouteModule` metadata for route-module code splitting.
- Use `navigateWithTransition` only as progressive enhancement; normal
  navigation remains the fallback.

## Data Lifecycle

- Use `resource.routeDataPolicy(routeId, ttlMs, props)` for route-owned data,
  and `routeRequestPolicy` / `resource.routeRequestPolicy` when a loader needs
  request scope plus background refresh defaults.
- Use `requestRouteDataPolicy` when SSR needs request identity without losing
  route invalidation scope.
- Use `requestScope` for request-aware SSR and `scoped` for app/domain
  ownership.
- Use `abortOnRefresh`, `backgroundRefresh`, tags, and dependencies for
  cancellation, stale-while-revalidate, and invalidation.
- Cancel rapid navigation with `cancelRouteNode` and revalidate with
  `revalidateRouteNode`.
- Revalidate request-owned loaders with `invalidateRequest`, and clear request
  records with `clearRequestScope` after SSR/request teardown.

## Mutations And Forms

- Use `formDataSubmitProps` and `fileInputNamed` for file/form submissions.
- Use `fieldArrayItemName` for nested array fields.
- Map server errors with `serverValidation` and `applyServerValidation`.
- Wire errors with `fieldControlProps`, `fieldErrorProps`, and
  `validationSummaryProps` so accessible names and alerts stay predictable.
- Use `submitActionWithRollback` when optimistic UI needs a rollback policy.
- Use `submitActionWithCurrentRollback` when the current resource value is the
  rollback baseline.
- Keep `submitting` state in `submitAction` or `submitRouteAction`; both reset
  after success or rejection.

## SSR And Hydration

- Put request metadata into `ssg.requestOptions`.
- Put serialized route/resource state into `hydrationOptions`.
- Use `renderToChunks` or `renderToReadableStream` when server delivery needs
  streamed HTML output.
- Mark islands with `islandProps` and deferred islands with
  `deferredHydrationProps`.
- Keep loader state in `loaderStateOptions` and serialized boot payloads in
  `serializedStateOptions`.
- Keep server-only request data separate from public hydration payloads.

## Devtools And Testing

- Record route/resource/render events with `@std/devtools`.
- Group inspector views with `routeInspector`, `resourceInspector`, and
  `hydrationInspector`.
- Use `inspectHydrationMismatch` for hydration recovery diagnostics.
- Use `testing.flush`, promise-aware `testing.waitFor`, `testing.actAsync`,
  `testing.settle`, and
  `findByText`/`findByRole`/`findByLabel` for async UI and route/action
  workflows.

## UI System

- Wrap app roots with `themeRoot`, `themeTokens`, or `tokenContract`.
- Use `appShellSidebar`, `appHeader`, `appSidebar`, and `appMain` for dashboard
  shells.
- Use `sidebarNav`, `navItem`, `toolbar`, `badge`, `formGrid`, and
  `emptyState` before inventing local layout wrappers.
- Use `variantProps`, `buttonWithState`, `fieldControlProps`, and
  `tableSortHeader` for loading controls, accessible fields, and sortable data
  tables.
- Use `tokenDeclaration`, `themeToken`, `tableCaption`, and
  `tablePaginationProps` when a team needs shared token and data-grid
  contracts.

## Folder Convention

```text
src/
  app.lm
  client.lm
  ssg.lm
  routes.lm
  session.lm
  features/
  shared/
```

Route files own route loaders/actions. Feature folders own domain state and
forms. Shared code must stay UI-agnostic unless it is part of the design-system
surface.
