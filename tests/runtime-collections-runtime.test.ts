import {
  BTreeMap,
  HashMap,
  PriorityQueue,
  Vec,
  configureCollectionsRuntime,
  count_q,
  iter,
  join_all,
  order_by_q,
  query,
  select_q,
  timeout,
  where_q,
} from '../src/runtime/collections-runtime.js';

const Option = {
  Some: (value: unknown) => ({ $tag: 'Some', $payload: value }),
  None: { $tag: 'None' },
};

const getTag = (value: unknown): string => ((value as { $tag?: string }).$tag ?? '');
const getPayload = <T = unknown>(value: unknown): T => (value as { $payload?: T }).$payload as T;

describe('runtime collections-runtime', () => {
  beforeAll(() => {
    configureCollectionsRuntime({
      getOption: () => Option,
      timeSleep: async () => undefined,
    });
  });

  test('Vec and iter helpers compose correctly', () => {
    const values = Vec.from([1, 2, 3, 4]);
    const doubled = iter.map_vec(values, (value) => value * 2);
    const windows = iter.window_vec(doubled, 2);
    const found = iter.find_vec(doubled, (value) => value === 6);
    const firstWindow = windows.get(0);

    expect(Array.from(doubled)).toEqual([2, 4, 6, 8]);
    expect(windows.len()).toBe(3);
    expect(getTag(found)).toBe('Some');
    expect(getPayload<number>(found)).toBe(6);
    expect(getTag(firstWindow)).toBe('Some');
    expect(Array.from(getPayload<Vec<number>>(firstWindow))).toEqual([2, 4]);
  });

  test('query helpers and join_all stay functional', async () => {
    const rows = Vec.from([
      { id: 2, name: 'beta' },
      { id: 1, name: 'alpha' },
      { id: 3, name: 'gamma' },
    ]);
    const shaped = select_q(
      where_q(order_by_q(query(rows), (row) => row.id), (row) => row.id !== 2),
      (row) => row.name
    );

    expect(count_q(shaped)).toBe(2);
    expect(Array.from(shaped.items)).toEqual(['alpha', 'gamma']);

    const joined = await join_all([Promise.resolve('a'), 'b']);
    expect(Array.from(joined)).toEqual(['a', 'b']);
    await expect(timeout(1)).resolves.toBeUndefined();
  });

  test('HashMap, BTreeMap, and PriorityQueue keep ordering and lookup behavior', () => {
    const map = HashMap.new<{ id: number }, string>();
    const key = { id: 1 };
    map.insert(key, 'one');
    expect(getTag(map.get({ id: 1 }))).toBe('Some');
    expect(getPayload<string>(map.get({ id: 1 }))).toBe('one');

    const tree = BTreeMap.new<number, string>();
    tree.insert(3, 'c');
    tree.insert(1, 'a');
    tree.insert(2, 'b');
    expect(Array.from(tree.keys())).toEqual([1, 2, 3]);

    const queue = PriorityQueue.new<number>();
    queue.push(3);
    queue.push(7);
    queue.push(5);
    expect(getPayload<number>(queue.pop())).toBe(3);
    expect(getPayload<number>(queue.peek())).toBe(5);
  });
});
