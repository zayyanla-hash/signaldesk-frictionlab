import { afterEach, describe, expect, it } from 'vitest';
import { clearAppStorage, createSaveTracker, loadStored, saveStored } from './storage';

function installMemoryStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  return store;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});

const isString = (d: unknown): d is string => typeof d === 'string';

describe('validated persisted storage', () => {
  it('reads fresh, valid, and wrapped values', () => {
    installMemoryStorage({ k: JSON.stringify({ v: 1, data: 'hi' }) });
    expect(loadStored('missing', isString, 'fb')).toMatchObject({ value: 'fb', status: 'fresh' });
    expect(loadStored('k', isString, 'fb')).toMatchObject({ value: 'hi', status: 'ok' });
  });

  it('recovers from corrupt JSON, unknown versions, and invalid shapes with notices', () => {
    installMemoryStorage({
      bad: '{nope',
      future: JSON.stringify({ v: 99, data: 'x' }),
      wrong: JSON.stringify({ v: 1, data: 42 }),
      legacy: JSON.stringify('plain'),
    });
    for (const key of ['bad', 'future', 'wrong']) {
      const r = loadStored(key, isString, 'fb');
      expect(r.status).toBe('recovered');
      expect(r.value).toBe('fb');
      expect(r.notice).toMatch(new RegExp(key === 'bad' ? 'corrupted' : key === 'future' ? 'unknown version' : 'failed validation'));
    }
    // Unwrapped legacy values that validate are accepted (forward migration).
    expect(loadStored('legacy', isString, 'fb')).toMatchObject({ value: 'plain', status: 'ok' });
  });

  it('reports save failures instead of implying durability', () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => undefined,
      key: () => null,
      length: 0,
    };
    const r = saveStored('k', { a: 1 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not durable|quota/);
    const loaded = loadStored('k', isString, 'fb');
    expect(loaded.status).toBe('recovered');
  });

  it('clears only app-namespaced keys', () => {
    const store = installMemoryStorage({ 'sd-x': '1', 'fl-y': '2', other: '3' });
    clearAppStorage();
    expect(store.has('other')).toBe(true);
    expect(store.has('sd-x')).toBe(false);
    expect(store.has('fl-y')).toBe(false);
  });

  it('keeps a targeted failed key visible across later successful keys', () => {
    const store = installMemoryStorage();
    const failing = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        if (k === 'k-weights') throw new Error('quota exceeded');
        store.set(k, String(v));
      },
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    };
    (globalThis as Record<string, unknown>).localStorage = failing;
    const tracker = createSaveTracker();
    tracker.save('k-accounts', { a: 1 });
    expect(tracker.error()).toBeNull();
    tracker.save('k-weights', { w: 1 });
    expect(tracker.error()).toMatch(/k-weights/);
    // Later successes on other keys must not hide the failed key.
    tracker.save('k-criteria', { c: 1 });
    tracker.save('k-accounts', { a: 2 });
    expect(tracker.error()).toMatch(/k-weights/);
    // Fixing the failed key clears the warning.
    (failing.setItem as (k: string, v: string) => void) = (k: string, v: string) => void store.set(k, String(v));
    tracker.save('k-weights', { w: 1 });
    expect(tracker.error()).toBeNull();
  });
});
