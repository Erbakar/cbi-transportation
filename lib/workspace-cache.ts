// Display snapshots only. Never cache credentials, authorization or write responses.
const prefix = 'cbi:display:v1:';
const maximumAge = 24 * 60 * 60 * 1000;
type Snapshot<T> = { value: T; checkedAt: number; stale?: boolean };
let generation = 0;
const memory = new Map<string, Snapshot<unknown>>();
const flights = new Map<string, Promise<unknown>>();
const controllers = new Set<AbortController>();
const keyFor = (owner: string, key: string) => prefix + JSON.stringify([owner, key]);
export function readDisplayCache<T>(owner: string, key: string): Snapshot<T> | null {
  if (typeof window === 'undefined') return null;
  const id = keyFor(owner, key);
  try {
    const stored = memory.get(id) ?? JSON.parse(sessionStorage.getItem(id) || 'null');
    if (stored && Number.isFinite(stored.checkedAt) && stored.checkedAt <= Date.now() && Date.now() - stored.checkedAt < maximumAge) {
      memory.set(id, stored);
      return stored as Snapshot<T>;
    }
  } catch { /* Storage may be unavailable or full; memory remains usable. */ }
  return null;
}
export const displayCacheGeneration = () => generation;
export function writeDisplayCache<T>(owner: string, key: string, value: T, epoch = generation) {
  if (epoch !== generation) return;
  if (typeof window === 'undefined') return;
  const id = keyFor(owner, key), previous = readDisplayCache<T>(owner, key);
  const unchanged = previous && JSON.stringify(previous.value) === JSON.stringify(value);
  const snapshot = { value: unchanged ? previous.value : value, checkedAt: Date.now() };
  memory.set(id, snapshot);
  try { sessionStorage.setItem(id, JSON.stringify(snapshot)); } catch { /* Memory fallback. */ }
}
export function clearDisplayCache() {
  generation++;
  for (const controller of controllers) controller.abort();
  controllers.clear(); flights.clear(); memory.clear();
  if (typeof window !== 'undefined') {
    try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key); } catch { /* No storage. */ }
  }
}
export function refreshDisplayCache<T>(owner: string, key: string, loader: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const id = keyFor(owner, key), pending = flights.get(id);
  if (pending) return pending as Promise<T>;
  const epoch = generation, controller = new AbortController();
  controllers.add(controller);
  const job = Promise.resolve().then(() => loader(controller.signal)).then(value => {
    if (epoch !== generation) throw new Error('Oturum değişti.');
    writeDisplayCache(owner, key, value);
    return value;
  }).finally(() => {
    controllers.delete(controller);
    if (flights.get(id) === job) flights.delete(id);
  });
  flights.set(id, job);
  return job;
}

// Manual refresh keeps the last display while requiring another source read.
export function invalidateDisplayCache(owner: string) {
  if (typeof window === 'undefined') return;
  const ids = new Set(memory.keys());
  try { for (const id of Object.keys(sessionStorage)) if(id.startsWith(prefix)) ids.add(id); } catch { /* Memory only. */ }
  for (const id of ids) {
    try {
      const [cachedOwner] = JSON.parse(id.slice(prefix.length));
      if(cachedOwner !== owner) continue;
      const snapshot = memory.get(id) ?? JSON.parse(sessionStorage.getItem(id) || 'null');
      if(!snapshot) continue;
      snapshot.stale = true; memory.set(id,snapshot);
      try {sessionStorage.setItem(id,JSON.stringify(snapshot));} catch { /* Memory only. */ }
    } catch { /* Ignore damaged snapshots. */ }
  }
}
