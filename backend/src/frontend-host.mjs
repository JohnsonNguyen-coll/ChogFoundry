import { realpathSync, statSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const types = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
  }),
);
const contained = (root, file) => {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

// Serve only an explicitly selected build directory, never the repository root.
export function createFrontendHost(directory) {
  const root = realpathSync(directory);
  const index = realpathSync(path.join(root, "index.html"));
  if (!contained(root, index) || !statSync(index).isFile())
    throw new Error(
      "Frontend build index unavailable. Run npm run build first.",
    );
  return async (req, res) => {
    const raw = (req.url || "/").split("?")[0];
    // Preserve API routing, errors, authentication and streaming without HTML fallback.
    if (raw === "/api" || raw.startsWith("/api/")) return false;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cache-Control", "no-store");
    const fail = (status, message) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(req.method === "HEAD" ? undefined : message);
      return true;
    };
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD");
      return fail(405, "Method not allowed.");
    }
    let pathname;
    try {
      pathname = decodeURIComponent(raw);
    } catch {
      return fail(400, "Invalid path.");
    }
    const segments = pathname.split("/");
    if (
      !pathname.startsWith("/") ||
      pathname.includes("\\") ||
      /[\x00-\x1f\x7f]/.test(pathname) ||
      segments.some((segment) => segment.startsWith(".")) ||
      pathname.includes("%")
    )
      return fail(400, "Invalid path.");
    // Encoded API separators cannot enter the client router.
    if (pathname === "/api" || pathname.startsWith("/api/"))
      return fail(400, "Invalid path.");
    const clientRoute =
      pathname === "/" ||
      ((pathname === "/app" || pathname.startsWith("/app/")) &&
        !path.posix.extname(pathname));
    const requested = clientRoute ? index : path.resolve(root, `.${pathname}`);
    if (!contained(root, requested)) return fail(404, "Not found.");
    try {
      const file = await realpath(requested);
      if (!contained(root, file)) return fail(404, "Not found.");
      const type = types.get(path.extname(file).toLowerCase());
      if (!type || !(await stat(file)).isFile()) return fail(404, "Not found.");
      const bytes = await readFile(file);
      const immutable =
        pathname.startsWith("/assets/") &&
        /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(pathname);
      res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": bytes.length,
        "Cache-Control":
          file === index
            ? "no-cache"
            : immutable
              ? "public, max-age=31536000, immutable"
              : "public, max-age=3600",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
      return true;
    } catch (error) {
      return fail(
        ["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code)
          ? 404
          : 500,
        "File unavailable.",
      );
    }
  };
}
