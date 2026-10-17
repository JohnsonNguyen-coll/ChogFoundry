import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

let origin;
try {
  origin = new URL(process.env.APP_ORIGIN);
} catch {
  throw new Error("Configure APP_ORIGIN as the public application origin.");
}
const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
if (
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  !["https:", "http:"].includes(origin.protocol) ||
  (!loopback && origin.protocol !== "https:")
) {
  throw new Error(
    "APP_ORIGIN must be an HTTPS origin (HTTP allowed only for loopback).",
  );
}
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
const host = process.env.HOST || "127.0.0.1";
const { createApi } = await import("../src/server.mjs");
const { server } = createApi({
  origin: origin.origin,
  frontendDirectory: fileURLToPath(
    new URL("../../frontend/dist", import.meta.url),
  ),
});
server.listen(port, host, () =>
  console.log(`Chog Foundry production server listening on port ${port}.`),
);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => server.closeAllConnections(), 10000);
    timeout.unref();
    server.close(() => clearTimeout(timeout));
  });
