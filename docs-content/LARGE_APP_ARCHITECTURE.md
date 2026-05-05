# Large App Architecture

Lumina large apps use explicit ownership boundaries instead of hidden framework
magic. Keep route tree, data lifecycle, mutations, SSR handoff, testing, and UI
tokens close to the code that owns them.

## Route Ownership

- Declare route modules with `routeNode` or `routeNodeWithChildren`.
- Keep layout ownership in `routeNodeLayout`.
- Keep route loaders/actions on the same node with `routeNodeLoader` and
  `routeNodeAction`.
- Use `lazyRouteModule` metadata for route-module code splitting.

## Data Lifecycle

- Use `resource.routeDataPolicy(routeId, ttlMs, props)` for route-owned data.
- Use `requestScope` for request-aware SSR and `scoped` for app/domain
  ownership.
- Use `abortOnRefresh`, `backgroundRefresh`, tags, and dependencies for
  cancellation, stale-while-revalidate, and invalidation.
- Cancel rapid navigation with `cancelRouteNode` and revalidate with
  `revalidateRouteNode`.

## Mutations And Forms

- Use `formDataSubmitProps` and `fileInputNamed` for file/form submissions.
- Use `fieldArrayItemName` for nested array fields.
- Map server errors with `serverValidation` and `applyServerValidation`.
- Use `submitActionWithRollback` when optimistic UI needs a rollback policy.

## SSR And Hydration

- Put request metadata into `ssg.requestOptions`.
- Put serialized route/resource state into `hydrationOptions`.
- Mark islands with `islandProps` and deferred islands with
  `deferredHydrationProps`.
- Keep server-only request data separate from public hydration payloads.

## Devtools And Testing

- Record route/resource/render events with `@std/devtools`.
- Use `inspectHydrationMismatch` for hydration recovery diagnostics.
- Use `testing.flush`, `testing.waitFor`, and `findByText`/`findByRole` for
  async UI and route/action workflows.

## UI System

- Wrap app roots with `themeRoot`, `themeTokens`, or `tokenContract`.
- Use `appShellSidebar`, `appHeader`, `appSidebar`, and `appMain` for dashboard
  shells.
- Use `sidebarNav`, `navItem`, `toolbar`, `badge`, `formGrid`, and
  `emptyState` before inventing local layout wrappers.

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
