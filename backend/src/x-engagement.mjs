import { randomBytes, createHash } from "node:crypto";
import { AppError } from "./validation.mjs";
import { xId } from "./community-validation.mjs";
const fail = (code, message, status = 503) => {
  throw new AppError(status, code, message);
};
export class XEngagement {
  constructor() {
    this.states = new Map();
    this.tokens = new Map();
    this.checks = new Map();
  }
  configured() {
    return !!(process.env.X_CLIENT_ID && process.env.APP_ORIGIN);
  }
  redirect() {
    const origin = new URL(process.env.APP_ORIGIN);
    return origin.origin + "/app/campaigns";
  }
  prune() {
    const now = Date.now();
    for (const map of [this.states, this.tokens])
      for (const [key, value] of map) if (value.expires <= now) map.delete(key);
    for (const [k, v] of this.checks)
      if (v < now - 60000) this.checks.delete(k);
  }
  start(wallet, sessionToken) {
    this.prune();
    if (!this.configured())
      fail(
        "X_NOT_CONFIGURED",
        "Configure the backend X OAuth client before linking accounts.",
      );
    if (this.states.size >= 1000) fail("X_BUSY", "Too many pending X links.");
    const state = randomBytes(24).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    this.states.set(state, {
      wallet: wallet.toLowerCase(),
      sessionToken,
      verifier,
      expires: Date.now() + 300000,
    });
    const url = new URL("https://x.com/i/oauth2/authorize");
    for (const [k, v] of Object.entries({
      response_type: "code",
      client_id: process.env.X_CLIENT_ID,
      redirect_uri: this.redirect(),
      scope: "tweet.read users.read follows.read like.read",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }))
      url.searchParams.set(k, v);
    return { url: url.href };
  }
  async finish(wallet, sessionToken, state, code, store, checkSession) {
    this.prune();
    if (
      typeof state !== "string" ||
      typeof code !== "string" ||
      code.length > 2048
    )
      fail("X_STATE_INVALID", "Invalid OAuth response.", 400);
    const pending = this.states.get(state);
    this.states.delete(state);
    if (
      !pending ||
      pending.wallet !== wallet.toLowerCase() ||
      pending.sessionToken !== sessionToken
    )
      fail(
        "X_STATE_INVALID",
        "X link expired or wallet session changed. Sign in and link again.",
        401,
      );
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.X_CLIENT_ID,
      code,
      redirect_uri: this.redirect(),
      code_verifier: pending.verifier,
    });
    let token;
    try {
      const response = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(process.env.X_CLIENT_SECRET
            ? {
                Authorization:
                  "Basic " +
                  Buffer.from(
                    process.env.X_CLIENT_ID + ":" + process.env.X_CLIENT_SECRET,
                  ).toString("base64"),
              }
            : {}),
        },
        body: form,
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
      if (!response.ok) fail("X_AUTH_FAILED", "X did not authorize this link.");
      token = await response.json();
    } catch {
      fail(
        "X_AUTH_FAILED",
        "Unable to complete X authorization. No points were credited.",
      );
    }
    if (
      typeof token.access_token !== "string" ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0
    )
      fail("X_AUTH_FAILED", "X returned an invalid authorization.");
    const me = await this.read("/users/me", token.access_token);
    if (!me.data?.username) fail("X_AUTH_FAILED", "X identity is unavailable.");
    xId(me.data.id);
    checkSession?.();
    const link = await store.link(wallet, me.data.id, me.data.username);
    this.tokens.set(wallet.toLowerCase(), {
      token: token.access_token,
      xUserId: me.data.id,
      expires: Date.now() + Math.min(token.expires_in, 7200) * 1000,
    });
    return link;
  }
  async read(route, token) {
    let response;
    try {
      response = await fetch("https://api.x.com/2" + route, {
        headers: { Authorization: "Bearer " + token },
        signal: AbortSignal.timeout(15000),
        redirect: "error",
      });
    } catch {
      fail(
        "X_UNAVAILABLE",
        "X verification is unavailable. No points were credited.",
      );
    }
    if (!response.ok) {
      const errors = {
        401: ['X_TOKEN_REJECTED', 'X API rejected the token (401). For task publishing, check X_BEARER_TOKEN in Railway; for engagement verification, reauthorize X.'],
        402: ['X_PAYMENT_REQUIRED', 'X API requires payment or available credits (402). Check billing and credits in the X Developer Console.'],
        403: ['X_ACCESS_FORBIDDEN', 'X API denied access (403). Check the X application permissions, endpoint access and account restrictions.'],
        429: ['X_RATE_LIMITED', 'X API rate limit or quota reached (429). Check usage in the X Developer Console before retrying.'],
      };
      const [code, message] = errors[response.status] || ['X_ACCESS_UNAVAILABLE', `X API request failed (${response.status}). Try again later.`];
      fail(code, message);
    }
    const raw = await response.text();
    if (raw.length > 3000000)
      fail("X_RESPONSE_LIMIT", "X response exceeds the verification limit.");
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      fail("X_UNAVAILABLE", "X returned an invalid response.");
    }
    if (result.errors?.length)
      fail("X_INCOMPLETE", "X returned incomplete verification data.");
    return result;
  }
  token(wallet) {
    this.prune();
    const access = this.tokens.get(wallet.toLowerCase());
    if (!access)
      fail(
        "X_RELINK_REQUIRED",
        "Link X again to authorize read-only verification.",
        401,
      );
    return access;
  }
  async target(postId = null) {
    const token = process.env.X_BEARER_TOKEN?.trim();
    if (!token)
      fail('X_APP_TOKEN_REQUIRED', 'Task publishing requires X_BEARER_TOKEN on the backend. The administrator does not need to link X.');
    const user = await this.read("/users/by/username/ChogNFT", token);
    const id = xId(user.data?.id);
    if (postId) {
      const post = await this.read(
        "/tweets/" + xId(postId) + "?tweet.fields=author_id",
        token,
      );
      if (post.data?.author_id !== id)
        fail(
          "X_TARGET_MISMATCH",
          "Only posts authored by @ChogNFT can be tasks.",
          400,
        );
    }
    return id;
  }
  async verify(wallet, task, replyId) {
    const access = this.token(wallet),
      key = wallet.toLowerCase();
    if (Date.now() - (this.checks.get(key) || 0) < 10000)
      fail("X_CHECK_RATE_LIMIT", "Wait before checking another X action.", 429);
    this.checks.set(key, Date.now());
    if (
      Date.parse(task.starts_at) > Date.now() ||
      Date.parse(task.ends_at) <= Date.now()
    )
      fail("TASK_CLOSED", "This task is not active.", 409);
    const evidence = {
      source: "X API v2",
      kind: task.kind,
      xUserId: access.xUserId,
      targetUserId: task.target_user_id,
      targetPostId: task.target_post_id,
      checkedAt: new Date().toISOString(),
    };
    if (task.kind === "reply") {
      const reply = await this.read(
        "/tweets/" +
          xId(replyId) +
          "?tweet.fields=author_id,referenced_tweets,created_at",
        access.token,
      );
      if (
        reply.data?.author_id !== access.xUserId ||
        !reply.data.referenced_tweets?.some(
          (r) => r.type === "replied_to" && r.id === task.target_post_id,
        )
      )
        fail(
          "X_ACTION_NOT_FOUND",
          "This post is not your direct reply to the task post.",
          422,
        );
      return { ...evidence, replyId: reply.data.id };
    }
    const path =
      task.kind === "follow"
        ? "/users/" + access.xUserId + "/following"
        : task.kind === "like"
          ? "/users/" + access.xUserId + "/liked_tweets"
          : "/tweets/" + task.target_post_id + "/retweeted_by";
    const wanted =
      task.kind === "follow"
        ? task.target_user_id
        : task.kind === "like"
          ? task.target_post_id
          : access.xUserId;
    let cursor;
    for (let page = 0; page < 5; page++) {
      const query = new URLSearchParams({
        max_results: task.kind === "follow" ? "1000" : "100",
      });
      if (cursor) query.set("pagination_token", cursor);
      const data = await this.read(path + "?" + query, access.token);
      if (data.data?.some((item) => item.id === wanted))
        return { ...evidence, pagesRead: page + 1 };
      cursor = data.meta?.next_token;
      if (!cursor)
        fail(
          "X_ACTION_NOT_FOUND",
          "X has not confirmed this action. No points were credited.",
          422,
        );
    }
    fail(
      "X_VERIFICATION_INCOMPLETE",
      "The bounded X scan is incomplete. No points were credited.",
    );
  }
}
