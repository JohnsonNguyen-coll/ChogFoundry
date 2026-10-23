import { createRequire } from 'node:module';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { vercelOutputConfig } from './vercel-config.mjs';

const config = vercelOutputConfig(process.env.FOUNDRY_API_ORIGIN);
const root = new URL('../', import.meta.url);
const requireFrontend = createRequire(new URL('frontend/package.json', root));
const { build } = await import(pathToFileURL(requireFrontend.resolve('vite')).href);
await build({ root: fileURLToPath(new URL('frontend/', root)) });
const output = new URL('.vercel/output/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('frontend/dist/', root), new URL('static/', output), { recursive: true });
await writeFile(new URL('config.json', output), JSON.stringify(config, null, 2) + '\n');
console.log('Vercel static output and Railway API proxy prepared.');
