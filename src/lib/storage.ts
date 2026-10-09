/**
 * Versioned, schema-validated browser persistence.
 * Every value is stored as { v, data }. Loads validate the shape and fall back
 * to sample data with a visible notice instead of crashing on bad saved state.
 * Save failures (quota, privacy mode) are returned so the UI can say so
 * instead of implying edits are durable.
 */

export const STORAGE_VERSION = 1;

export type LoadStatus = 'fresh' | 'ok' | 'recovered';

export interface LoadResult<T> {
  value: T;
  status: LoadStatus;
  notice?: string;
}

interface Wrapped {
  v: unknown;
  data: unknown;
}

function isWrapped(x: unknown): x is Wrapped {
  return typeof x === 'object' && x !== null && 'v' in x && 'data' in x;
}

export function loadStored<T>(key: string, validate: (d: unknown) => d is T, fallback: T): LoadResult<T> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { value: fallback, status: 'recovered', notice: `Browser storage is unavailable, so ${key} could not be read. Sample data is shown and edits will not persist.` };
  }
  if (raw == null) {
    // No saved value: verify storage is actually writable so a broken store
    // is reported instead of silently presenting sample data as fresh.
    try {
      localStorage.setItem('__storage_probe__', '1');
      localStorage.removeItem('__storage_probe__');
    } catch {
      return { value: fallback, status: 'recovered', notice: `Browser storage is unavailable, so ${key} could not be read. Sample data is shown and edits will not persist.` };
    }
    return { value: fallback, status: 'fresh' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { value: fallback, status: 'recovered', notice: `Saved data for ${key} was corrupted (invalid JSON). Sample data was restored.` };
  }
  const data = isWrapped(parsed) && parsed.v === STORAGE_VERSION ? parsed.data : parsed;
  if (isWrapped(parsed) && parsed.v !== STORAGE_VERSION) {
    return { value: fallback, status: 'recovered', notice: `Saved data for ${key} used an unknown version. Sample data was restored.` };
  }
  if (!validate(data)) {
    return { value: fallback, status: 'recovered', notice: `Saved data for ${key} failed validation. Sample data was restored.` };
  }
  return { value: data, status: 'ok' };
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export function saveStored(key: string, value: unknown): SaveResult {
  try {
    localStorage.setItem(key, JSON.stringify({ v: STORAGE_VERSION, data: value }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Could not save ${key} (${e instanceof Error ? e.message : 'storage error'}). Edits are not durable in this browser session.` };
  }
}

export interface SaveTracker {
  /** Save one key; failures accumulate, successes clear only their own key. */
  save: (key: string, value: unknown) => void;
  /** Combined failure message, or null when everything intended is durable. */
  error: () => string | null;
}

/**
 * Sticky multi-key save tracking: a failure on one key followed by successes
 * on other keys must not hide the failure. Warnings stay visible until every
 * intended key is durable.
 */
export function createSaveTracker(): SaveTracker {
  const failed = new Map<string, string>();
  return {
    save(key: string, value: unknown) {
      const r = saveStored(key, value);
      if (r.ok) failed.delete(key);
      else failed.set(key, r.error ?? `Save failed for ${key}.`);
    },
    error() {
      const msgs = [...failed.values()];
      return msgs.length > 0 ? msgs.join(' ') : null;
    },
  };
}

export function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // read-only environments: nothing to do
  }
}

/** Remove all app-namespaced keys (sd-*, fl-*). Used by reset and error recovery. */
export function clearAppStorage(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('sd-') || k.startsWith('fl-'))) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore: recovery proceeds with in-memory defaults
  }
}

/* ---------- shared shape guards ---------- */

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

export function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((e) => typeof e === 'string');
}

export function isNumberRecord(x: unknown, keys: string[]): x is Record<string, number> {
  if (!isRecord(x)) return false;
  return keys.every((k) => typeof x[k] === 'number' && Number.isFinite(x[k]));
}

export { isRecord };
