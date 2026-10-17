import { AppError, tokenId } from "./validation.mjs";
export const invalid = (message) => {
  throw new AppError(400, "INVALID_COMMUNITY_INPUT", message);
};
export function text(value, max, required = true) {
  if (typeof value !== "string") invalid("Text is required.");
  value = value.trim();
  if (
    (required && !value) ||
    Buffer.byteLength(value, "utf8") > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    invalid("Text is empty, too long or contains invalid characters.");
  return value;
}
export function uuid(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalid("Invalid resource ID.");
  return value.toLowerCase();
}
export function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    invalid("Integer outside allowed range.");
  return value;
}
export function xId(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,24}$/.test(value))
    invalid("Use the numeric X post/user ID.");
  return value;
}
export function room(value = "lounge") {
  if (
    !["lounge", "announcements", "ideas"].includes(value) &&
    !/^token:0x[0-9a-f]{40}$/i.test(value)
  )
    invalid("Invalid club room.");
  return value.toLowerCase();
}
export function httpsLink(value) {
  value = text(value ?? "", 2048, false);
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      invalid("An HTTPS URL without credentials is required.");
    return url.href;
  } catch {
    invalid("Invalid HTTPS URL.");
  }
}
export function postInput(input) {
  const kind = input?.kind ?? "message";
  if (!["message", "concept", "meme"].includes(kind))
    invalid("Invalid post type.");
  const selected = room(input?.room);
  if (kind !== "message" && selected !== "ideas")
    invalid("Proposals belong in the ideas room.");
  return {
    room: selected,
    kind,
    title: text(input.title ?? "", 100, kind !== "message"),
    content: text(input.content, 2000),
    imageUrl: httpsLink(input.imageUrl),
  };
}
export function timeRange(input) {
  const start = Date.parse(input.startsAt),
    end = Date.parse(input.endsAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end <= Date.now() ||
    end - start > 90 * 86400000 ||
    start % 1000 !== 0 ||
    end % 1000 !== 0
  )
    invalid("Use a future end, after the start, within 90 days.");
  return {
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
  };
}
export function taskInput(input) {
  if (!["follow", "like", "reply", "repost"].includes(input?.kind))
    invalid("Unsupported X task.");
  return {
    kind: input.kind,
    title: text(input.title, 100),
    points: integer(input.points, 1, 1000000),
    targetPostId: input.kind === "follow" ? null : xId(input.targetPostId),
    ...timeRange(input),
  };
}
export function campaignInput(input) {
  return {
    title: text(input?.title, 100),
    rules: text(input.rules, 4000),
    prizeTokenId: String(tokenId(input.prizeTokenId)),
    entryPoints: integer(input.entryPoints, 1, 1000000000),
    maxEntries: integer(input.maxEntries, 1, 5000),
    ...timeRange(input),
  };
}

export function postIdentifier(value) {
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]{0,18}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    invalid("Post ID must be a positive signed-64-bit integer.");
  return value;
}
