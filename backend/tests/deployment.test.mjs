import test from 'node:test';
import assert from 'node:assert/strict';
import { productionRuntime } from '../src/runtime-config.mjs';
import { vercelOutputConfig } from '../../scripts/vercel-config.mjs';
import { createApi } from '../src/server.mjs';

test('Railway API mode uses the supplied port and frontend origin, preserving the combined-host default', () => {
  assert.deepEqual(productionRuntime({ APP_ORIGIN: 'https://foundry.example', HOST: '0.0.0.0', PORT: '8080', SERVE_FRONTEND: 'false' }),
    { origin: 'https://foundry.example', host: '0.0.0.0', port: 8080, serveFrontend: false });
  assert.equal(productionRuntime({ APP_ORIGIN: 'http://127.0.0.1:5173' }).serveFrontend, true);
  for (const origin of ['http://foundry.example', 'https://user:password@foundry.example', 'https://foundry.example/app', 'https://foundry.example?x=1'])
    assert.throws(() => productionRuntime({ APP_ORIGIN: origin }));
  assert.throws(() => productionRuntime({ APP_ORIGIN: 'https://foundry.example', PORT: '70000' }));
});

test('Vercel keeps API requests on the external proxy and only app routes use the SPA fallback', () => {
  const config = vercelOutputConfig('https://api.example.com/');
  const match = pathname => config.routes.find(route => route.src && new RegExp(`^(?:${route.src})$`).test(pathname));
  for (const path of ['/api', '/api/rpc', '/api/auth/verify', '/api/tokens/0x123/stream', '/api/not-found']) {
    const route = match(path);
    assert.ok(route.dest.startsWith('https://api.example.com/api'));
    assert.equal(route.headers['Cache-Control'], 'no-store');
  }
  for (const path of ['/', '/app', '/app/markets/0x123', '/app/campaigns']) assert.equal(match(path).dest, '/index.html');
  assert.equal(match('/assets/missing.js').dest, undefined);
  assert.equal(match('/.env').status, 404);
  assert.equal(match('/package.json').status, 404);
});

test('frontend hosting fails closed on an absent, insecure or path-based API origin', () => {
  for (const origin of [undefined, '', 'http://api.example.com', 'https://api.example.com/api', 'https://u:p@api.example.com', 'https://api.example.com?key=value', 'https://localhost'])
    assert.throws(() => vercelOutputConfig(origin));
});

test('API-only service serves health JSON and keeps strict origin checks without a frontend build', async () => {
  const { server } = createApi({ databasePath: ':memory:', origin: 'https://foundry.example' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    assert.match(health.headers.get('content-type'), /application\/json/);
    assert.equal((await health.json()).service, 'Chog Foundry API');
    const page = await fetch(base + '/app/campaigns');
    assert.equal(page.status, 404);
    assert.match(page.headers.get('content-type'), /application\/json/);
    const foreign = await fetch(base + '/api/auth/challenge', { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).error.code, 'ORIGIN_REQUIRED');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
