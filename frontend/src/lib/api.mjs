import {loadingFetch} from './loading.mjs';
export async function api(route, signal) {
  const response = await loadingFetch(`/api${route}`, {
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
        : AbortSignal.timeout(25000),
    }),
    body = await response.json();
  if (!response.ok)
    throw new Error(body.error?.message || "Unable to load data.");
  return body;
}
export const short = (value) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—";
export function amount(value) {
  if (value == null) return "Unavailable";
  const [whole, fraction] = value.split(".");
  return `${BigInt(whole).toLocaleString("en-US")}${fraction && fraction !== "0" ? "." + fraction : ""}`;
}
