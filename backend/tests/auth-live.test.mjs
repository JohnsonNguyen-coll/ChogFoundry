import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet } from 'ethers';
import { createApi } from '../src/server.mjs';

test('real wallet signatures against live Monad: replay, origin, non-owner and logout', { timeout: 120000 }, async () => {
  const origin = 'http://127.0.0.1:5173';
  const { server, store } = createApi({ databasePath: ':memory:', origin });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  // An unfunded cryptographic wallet; no account or NFT ownership is fabricated.
  const wallet = Wallet.createRandom();
  async function post(route, data, cookie, requestOrigin = origin) {
    return fetch(base + route, { method: 'POST', headers: { Origin: requestOrigin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) });
  }
  try {
    assert.equal((await post('/api/auth/challenge', { wallet: wallet.address }, null, 'https://other.example')).status, 403);
    const issued = await post('/api/auth/challenge', { wallet: wallet.address });
    const challenge = await issued.json(); assert.equal(issued.status, 200, JSON.stringify(challenge));
    assert.equal(challenge.anchor.finality, 'finalized');
    const input = { challengeId: challenge.challengeId, message: challenge.message, signature: await wallet.signMessage(challenge.message) };
    const verified = await post('/api/auth/verify', input);
    assert.equal(verified.status, 200);
    const cookie = verified.headers.get('set-cookie').split(';')[0];
    assert.match(verified.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await post('/api/auth/verify', input)).status, 401);
    const session = await (await fetch(base + '/api/session', { headers: { Cookie: cookie } })).json();
    assert.equal(session.session.wallet, wallet.address);
    const denied = await fetch(base + '/api/studios/1557/profile', { method: 'PUT', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Unauthorized write', description: '', website: '', coverUrl: '', expectedRevision: 0 }) });
    assert.equal(denied.status, 403, JSON.stringify(await denied.json()));
    assert.equal(store.list().length, 0);
    const next = await (await post('/api/auth/challenge', { wallet: wallet.address })).json();
    const tampered = { challengeId: next.challengeId, message: next.message + 'changed', signature: await wallet.signMessage(next.message) };
    assert.equal((await post('/api/auth/verify', tampered)).status, 401);
    const wrong = await (await post('/api/auth/challenge', { wallet: wallet.address })).json();
    assert.equal((await post('/api/auth/verify', { challengeId: wrong.challengeId, message: wrong.message, signature: await Wallet.createRandom().signMessage(wrong.message) })).status, 401);

    assert.equal((await post('/api/auth/logout', {}, cookie)).status, 200);
    assert.equal((await (await fetch(base + '/api/session', { headers: { Cookie: cookie } })).json()).session, null);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
