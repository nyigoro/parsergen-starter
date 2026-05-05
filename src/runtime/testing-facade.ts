import {
  createTestingDomHarness,
  dispatchTestingCheckedChange,
  dispatchTestingClick,
  dispatchTestingInput,
  dispatchTestingKeydown,
  dispatchTestingSubmit,
  getTestingHarnessBody,
  getTestingHarnessById,
  getTestingHarnessByLabel,
  getTestingHarnessByPlaceholder,
  getTestingHarnessByText,
  getTestingHarnessContainer,
  getTestingTextContent,
  queryTestingHarnessByRole,
  type TestingDomHarness,
} from '../testing-dom.js';

export type { TestingDomHarness } from '../testing-dom.js';

export interface TestingFacadeDeps<TComponentFn, TRoot> {
  createRenderer: (documentLike: unknown) => unknown;
  mountApp: (
    harness: TestingDomHarness,
    componentFn: TComponentFn,
    props: unknown,
    hydrate: boolean
  ) => TRoot;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const settleTestingAttempt = async (
  check: () => unknown,
  timeoutMs: number
): Promise<{ settled: boolean; value?: unknown }> => {
  const pending = Promise.resolve().then(check);
  pending.catch(() => undefined);
  const timeout = sleep(timeoutMs).then(() => ({ __timeout: true }));
  const value = await Promise.race([pending, timeout]);
  if (value && typeof value === 'object' && (value as { __timeout?: boolean }).__timeout === true) {
    return { settled: false };
  }
  return { settled: true, value };
};

export const createTestingFacade = <TComponentFn, TRoot>(
  deps: TestingFacadeDeps<TComponentFn, TRoot>
) => ({
  testing_create_dom_harness: (): TestingDomHarness => {
    const harness = createTestingDomHarness();
    harness.renderer = deps.createRenderer(harness.document as unknown);
    return harness;
  },
  testing_mount_app: (harness: TestingDomHarness, componentFn: TComponentFn, props: unknown): TRoot =>
    deps.mountApp(harness, componentFn, props, false),
  testing_hydrate_app: (harness: TestingDomHarness, componentFn: TComponentFn, props: unknown): TRoot =>
    deps.mountApp(harness, componentFn, props, true),
  testing_container: (harness: unknown): unknown => getTestingHarnessContainer(harness),
  testing_body: (harness: unknown): unknown => getTestingHarnessBody(harness),
  testing_get_by_id: (harness: unknown, id: string): unknown => getTestingHarnessById(harness, id),
  testing_get_by_text: (scope: unknown, value: string): unknown => getTestingHarnessByText(scope, value),
  testing_get_by_role: (scope: unknown, role: string): unknown => queryTestingHarnessByRole(scope, role)[0] ?? null,
  testing_get_by_role_name: (scope: unknown, role: string, name: string): unknown =>
    queryTestingHarnessByRole(scope, role, name)[0] ?? null,
  testing_query_all_by_role: (scope: unknown, role: string): unknown => queryTestingHarnessByRole(scope, role),
  testing_get_by_label: (scope: unknown, label: string): unknown => getTestingHarnessByLabel(scope, label),
  testing_get_by_placeholder: (scope: unknown, placeholder: string): unknown =>
    getTestingHarnessByPlaceholder(scope, placeholder),
  testing_text_content: (node: unknown): string => getTestingTextContent(node),
  testing_click: (node: unknown): void => dispatchTestingClick(node),
  testing_input: (node: unknown, value: string): void => dispatchTestingInput(node, value),
  testing_change_checked: (node: unknown, checked: boolean): void => dispatchTestingCheckedChange(node, checked),
  testing_keydown: (node: unknown, key: string, shiftKey?: boolean): void =>
    dispatchTestingKeydown(node, key, shiftKey ?? false),
  testing_submit: (node: unknown): void => dispatchTestingSubmit(node),
  testing_flush: async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
  },
  testing_wait_for: async (check: () => unknown, attempts = 5): Promise<unknown> => {
    const limit = Math.max(1, Math.trunc(Number(attempts) || 1));
    let lastError: unknown = null;
    for (let i = 0; i < limit; i += 1) {
      try {
        const attempt = await settleTestingAttempt(check, 10);
        if (attempt.settled && attempt.value) return attempt.value;
        lastError = null;
        if (attempt.settled) {
          await sleep(10);
        }
      } catch (error) {
        lastError = error;
        await sleep(10);
      }
    }
    if (lastError) throw lastError;
    return null;
  },
});
