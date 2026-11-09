// localStorage wrapped so private mode, blocked storage or quota errors never break the app.

const memory = new Map<string, string>();

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw != null) return JSON.parse(raw) as T;
  } catch {
    const raw = memory.get(key);
    if (raw != null) {
      try {
        return JSON.parse(raw) as T;
      } catch {}
    }
  }
  return fallback;
}

export function writeJSON(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {}
}

export function remove(key: string): void {
  memory.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {}
}
