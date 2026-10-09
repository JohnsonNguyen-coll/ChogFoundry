import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
try { process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const { createApi } = await import('../src/server.mjs');
const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { createServer } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
const { server } = createApi();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3001, '127.0.0.1', resolve); });
let frontend;
try {
  frontend = await createServer({ root: fileURLToPath(new URL('../../frontend', import.meta.url)), server: { host: '127.0.0.1', port: 5173, strictPort: true } });
  await frontend.listen();
  console.log('Chog Foundry: http://127.0.0.1:5173 — live Monad reads and owner-managed profiles');
} catch (error) { server.close(); throw error; }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await frontend.close(); server.close(); });

