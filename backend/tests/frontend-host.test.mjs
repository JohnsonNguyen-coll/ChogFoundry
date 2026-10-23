import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import http from "node:http";
import { createApi } from "../src/server.mjs";
import { createFrontendHost } from "../src/frontend-host.mjs";

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "foundry-host-"));
  let server;
  t.after(async () => {
    if (server?.listening)
      await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  await mkdir(path.join(directory, "assets"));
  const html = '<!doctype html><html><body><div id="root"></div></body></html>';
  await writeFile(path.join(directory, "index.html"), html);
  await writeFile(
    path.join(directory, "assets", "entry-Abcd1234.js"),
    "export const built = true;",
  );
  await writeFile(path.join(directory, ".env"), "must-never-be-served");
  await writeFile(path.join(directory, "private.map"), "must-never-be-served");
  ({ server } = createApi({
    frontendDirectory: directory,
    origin: "https://foundry.example",
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const request = (url, method = "GET") =>
    new Promise((resolve, reject) => {
      const req = http.request(
        { host: "127.0.0.1", port: server.address().port, path: url, method },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString(),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  return { request, html, directory };
}

test("production host serves deep links and HEAD without caching the application shell", async (t) => {
  const { request, html } = await fixture(t);
  for (const route of [
    "/",
    "/app",
    "/app/markets/0x123",
    "/app/studios/1557",
    "/app/launch?studio=1557",
    "/app/unknown",
    "/docs",
    "/docs/getting-started",
  ]) {
    const res = await request(route);
    assert.equal(res.status, 200, route);
    assert.equal(res.body, html);
    assert.match(res.headers["content-type"], /^text\/html/);
    assert.equal(res.headers["cache-control"], "no-cache");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  }
  const head = await request("/app/portfolio", "HEAD");
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  assert.equal(Number(head.headers["content-length"]), Buffer.byteLength(html));
});

test("production static assets get explicit MIME/cache headers while missing assets stay errors", async (t) => {
  const { request } = await fixture(t);
  const asset = await request("/assets/entry-Abcd1234.js");
  assert.equal(asset.status, 200);
  assert.match(asset.headers["content-type"], /^text\/javascript/);
  assert.equal(
    asset.headers["cache-control"],
    "public, max-age=31536000, immutable",
  );
  for (const route of [
    "/assets/missing.js",
    "/app/missing.js",
    "/unrelated",
    "/private.map",
  ]) {
    const res = await request(route);
    assert.equal(res.status, 404, route);
    assert.doesNotMatch(res.body, /doctype|must-never/);
  }
  const post = await request("/app/launch", "POST");
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET, HEAD");
});

test("production host rejects traversal, hidden files, malformed encodings and encoded API paths", async (t) => {
  const { request } = await fixture(t);
  for (const route of [
    "/.env",
    "/../package.json",
    "/%2e%2e/package.json",
    "/assets/../.env",
    "/%252eenv",
    "/%00",
    "/%xx",
    "/app%5c..%5c.env",
    "/api%2fhealth",
  ]) {
    const res = await request(route);
    assert.equal(res.status, 400, route);
    assert.doesNotMatch(res.body, /must-never/);
  }
});

test("same-origin API keeps JSON errors, health and origin authentication instead of serving HTML", async (t) => {
  const { request } = await fixture(t);
  const health = await request("/api/health");
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).service, "Chog Foundry API");
  assert.equal(health.headers["cache-control"], "no-store");
  for (const route of ["/api", "/api/not-found", "/api/assets/missing.js"]) {
    const res = await request(route);
    assert.equal(res.status, 404);
    assert.equal(JSON.parse(res.body).error.code, "NOT_FOUND");
  }
  const auth = await request("/api/auth/logout", "POST");
  assert.equal(auth.status, 403);
  assert.equal(JSON.parse(auth.body).error.code, "ORIGIN_REQUIRED");
});

test("production host refuses to start without a real built index", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "foundry-no-build-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.throws(() => createFrontendHost(directory));
});

test("production host refuses files reached through a symlink outside the build directory", async (t) => {
  const { request, directory } = await fixture(t);
  const outside = await mkdtemp(path.join(tmpdir(), "foundry-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(
    path.join(outside, "secret.txt"),
    "must-not-leave-the-build-root",
  );
  await symlink(
    outside,
    path.join(directory, "assets", "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const res = await request("/assets/escape/secret.txt");
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.body, /must-not-leave/);
});
