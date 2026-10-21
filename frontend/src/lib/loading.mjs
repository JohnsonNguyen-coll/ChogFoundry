const requests = new Map(), listeners = new Set();
let sequence = 0, version = 0;
export const loadingVersion = () => version;
export function subscribeLoading(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notify() { version++; for (const listener of listeners) listener(); }
export function pendingRequests(route) {
  return [...requests.values()].filter(value => value === route).length;
}
// Track application API reads and writes, never wallet signing or RPC subscriptions.
export async function loadingFetch(input, options) {
  const route = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
  const id = ++sequence;
  requests.set(id, route);
  notify();
  const finish = () => { if (requests.delete(id)) notify(); };
  const signal = options?.signal;
  signal?.addEventListener('abort', finish, {once: true});
  try { return await fetch(input, options); }
  finally { signal?.removeEventListener('abort', finish); finish(); }
}
