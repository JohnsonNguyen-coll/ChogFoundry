export async function communityRequest(route, data, signal) {
  const response = await fetch("/api" + route, {
    method: data === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message || "Community request unavailable.");
  return result;
}
export const timestamp = (value) =>
  value ? new Date(value).toLocaleString("en-US") : "Unavailable";
export function postId(value) {
  const match =
    /^(?:https:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/)?([1-9][0-9]{0,24})(?:\?.*)?$/.exec(
      value.trim(),
    );
  if (!match) throw new Error("Enter the numeric post ID or an X post URL.");
  return match[1];
}
