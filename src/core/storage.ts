/** Tiny, failure-tolerant persistence (private mode, quota, bad JSON...). */

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryKV implements KV {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

export const PREFIX = 'desk-bloom:v1:';

export function safeStorage(): KV {
  try {
    const ls = globalThis.localStorage;
    const probe = `${PREFIX}probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryKV();
  }
}

export function loadJSON(kv: KV, key: string): unknown {
  try {
    const raw = kv.getItem(PREFIX + key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveJSON(kv: KV, key: string, value: unknown): boolean {
  try {
    kv.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearAll(kv: KV, keys: readonly string[]): void {
  for (const k of keys) {
    try {
      kv.removeItem(PREFIX + k);
    } catch {
      /* ignore */
    }
  }
}
