import { fileURLToPath } from "node:url";
import { productionRuntime } from '../src/runtime-config.mjs';

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const { origin, port, host, serveFrontend } = productionRuntime();
const { createApi } = await import("../src/server.mjs");
const { server } = createApi({
  origin,
  frontendDirectory: serveFrontend ? fileURLToPath(
    new URL("../../frontend/dist", import.meta.url),
  ) : undefined,
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
