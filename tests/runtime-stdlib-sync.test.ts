import { sync } from '../src/lumina-runtime.js';

describe('runtime sync helpers', () => {
  const tick = async () => new Promise((resolve) => setTimeout(resolve, 0));

  test('mutex try_acquire/release lifecycle', () => {
    const mutex = sync.mutex_new();
    expect(sync.mutex_is_locked(mutex)).toBe(false);
    expect(sync.mutex_try_acquire(mutex)).toBe(true);
    expect(sync.mutex_is_locked(mutex)).toBe(true);
    expect(sync.mutex_try_acquire(mutex)).toBe(false);
    expect(sync.mutex_release(mutex)).toBe(true);
    expect(sync.mutex_is_locked(mutex)).toBe(false);
    expect(sync.mutex_release(mutex)).toBe(false);
  });

  test('mutex acquire waits for release', async () => {
    const mutex = sync.mutex_new();
    expect(sync.mutex_try_acquire(mutex)).toBe(true);

    let acquired = false;
    const waiter = sync.mutex_acquire(mutex).then((ok) => {
      acquired = ok;
      return ok;
    });

    await tick();
    expect(acquired).toBe(false);

    expect(sync.mutex_release(mutex)).toBe(true);
    expect(await waiter).toBe(true);
    expect(sync.mutex_is_locked(mutex)).toBe(true);
    expect(sync.mutex_release(mutex)).toBe(true);
  });

  test('semaphore backpressure behavior', async () => {
    const sem = sync.semaphore_new(2);
    expect(sync.semaphore_available(sem)).toBe(2);
    expect(sync.semaphore_try_acquire(sem)).toBe(true);
    expect(sync.semaphore_try_acquire(sem)).toBe(true);
    expect(sync.semaphore_try_acquire(sem)).toBe(false);
    expect(sync.semaphore_available(sem)).toBe(0);

    let acquired = false;
    const waiter = sync.semaphore_acquire(sem).then((ok) => {
      acquired = ok;
      return ok;
    });
    await tick();
    expect(acquired).toBe(false);

    sync.semaphore_release(sem, 1);
    expect(await waiter).toBe(true);
  });

  test('atomic_i32 operations', () => {
    const atomic = sync.atomic_i32_new(10);
    expect(typeof sync.atomic_i32_is_available()).toBe('boolean');
    expect(sync.atomic_i32_load(atomic)).toBe(10);
    expect(sync.atomic_i32_add(atomic, 5)).toBe(10);
    expect(sync.atomic_i32_load(atomic)).toBe(15);
    expect(sync.atomic_i32_sub(atomic, 3)).toBe(15);
    expect(sync.atomic_i32_load(atomic)).toBe(12);
    expect(sync.atomic_i32_compare_exchange(atomic, 12, 99)).toBe(12);
    expect(sync.atomic_i32_load(atomic)).toBe(99);
    expect(sync.atomic_i32_compare_exchange(atomic, 12, 7)).toBe(99);
    expect(sync.atomic_i32_store(atomic, 5)).toBe(5);
    expect(sync.atomic_i32_load(atomic)).toBe(5);
  });
});
