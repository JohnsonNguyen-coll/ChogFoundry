import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenId, address, boundedBlock } from '../src/validation.mjs';
import { createApi } from '../src/server.mjs';

test('uint256 accepts exact integer strings, including zero, and rejects overflow', () => {
  assert.equal(tokenId('0'), 0n);
  assert.equal(tokenId(String(2n ** 256n - 1n)), 2n ** 256n - 1n);
  for (const value of ['-1', '1.2', '01', '', '1e3', String(2n ** 256n), 1]) assert.throws(() => tokenId(value), /uint256/);
});
test('wallet address checks checksum and rejects malformed values', () => {
  assert.equal(address('0x350035555e10d9afaf1566aaebfced5ba6c27777'), '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777');
  assert.throws(() => address('not-an-address'));
});
test('block parsing does not accept negative, fractional or unsafe numbers', () => {
  assert.equal(boundedBlock('0'), 0); assert.equal(boundedBlock('123'), 123);
  for (const value of ['-1', '1.2', '1e3', '9007199254740992', '']) assert.throws(() => boundedBlock(value));
});
test('HTTP validates requests and rejects writes before touching RPC; no stubs', async () => {
  const { server } = createApi({ databasePath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [route, method, status] of [['/api/studios/-1', 'GET', 400], ['/api/wallets/invalid', 'GET', 400], ['/api/studios/1/transfers?fromBlock=-1', 'GET', 400], ['/api/overview', 'POST', 405], ['/api/unknown', 'GET', 404]]) {
      const response = await fetch(base + route, { method });
      assert.equal(response.status, status); assert.ok((await response.json()).error.code);
    }
    const response = await fetch(base + '/api/health');
    assert.equal((await response.json()).rpcChecked, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
