import { actionWallet } from '../src/fee-actions.mjs';
import { preflightInput } from '../src/trade-preflight.mjs';
import { tradeInput } from '../src/trade-data.mjs';
import { parseAmount } from '../../frontend/src/market-format.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenId, address, boundedBlock } from '../src/validation.mjs';
import { createApi } from '../src/server.mjs';

test('uint256 accepts exact integer strings, including zero, and rejects overflow', () => {
  assert.equal(tokenId('0'), 0n);
  assert.equal(tokenId(String(2n ** 256n - 1n)), 2n ** 256n - 1n);
  for (const value of ['-1', '1.2', '01', '', '1e3', String(2n ** 256n), 1]) assert.throws(() => tokenId(value), /uint256/);
});
test('trade quantities preserve exact units and reject ambiguous or overflowing inputs', () => {
  assert.equal(parseAmount('0.000000000000000001'),'1');
  assert.equal(parseAmount('123456789.123456789123456789'),'123456789123456789123456789');
  for(const amount of ['0','-1','1e3','01','1.','0.0000000000000000001',' 1',String(2n**256n)])assert.throws(()=>parseAmount(amount));
  assert.deepEqual(tradeInput('buy','1',null),{side:'buy',amountRaw:'1',wallet:null});
  for(const amount of ['0','01','-1','1.5','1e3',String(2n**256n)])assert.throws(()=>tradeInput('buy',amount),e=>e.code==='INVALID_TRADE_AMOUNT');
  assert.throws(()=>tradeInput('hold','1'),e=>e.code==='INVALID_TRADE_SIDE');
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
    for (const [route, method, status] of [['/api/studios/-1', 'GET', 400], ['/api/wallets/invalid', 'GET', 400], ['/api/studios/1/transfers?fromBlock=-1', 'GET', 400], ['/api/overview', 'POST', 405], ['/api/tokens/invalid/quote?side=buy&amountRaw=1','GET',400], ['/api/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777/quote?side=buy&amountRaw=0','GET',400], ['/api/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777/account','GET',400], ['/api/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777/preflight?side=buy&amountRaw=1','GET',400], ['/api/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777/claim-preflight','GET',400], ['/api/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777/approval','GET',400], ['/api/unknown', 'GET', 404], ['/api/tokens/invalid/market', 'GET', 400], ['/api/tokens/invalid/history', 'GET', 400], ['/api/tokens/invalid/stream', 'GET', 400], ['/api/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777/market?interval=7', 'GET', 400]]) {
      const response = await fetch(base + route, { method });
      assert.equal(response.status, status); assert.ok((await response.json()).error.code);
    }
    const response = await fetch(base + '/api/health');
    assert.equal((await response.json()).rpcChecked, false);
  } finally { await new Promise(resolve => server.close(resolve)); }
});


test('market endpoint reports unavailable without a configured deployment; no RPC fallback', async () => {
  const previous=process.env.FOUNDRY_FACTORY_ADDRESS;
  delete process.env.FOUNDRY_FACTORY_ADDRESS;
  const {server}=createApi({databasePath:':memory:'});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777/market`);
    assert.equal(response.status,503);
    assert.equal((await response.json()).error.code,'FOUNDRY_NOT_CONFIGURED');
    const base=`http://127.0.0.1:${server.address().port}`;
    for(const suffix of ['claim-preflight?wallet=0x350035555E10d9AfAF1566AaebfCeD5BA6C27777','approval?side=buy&amountRaw=1&wallet=0x350035555E10d9AfAF1566AaebfCeD5BA6C27777','preflight?side=buy&amountRaw=1&minOutputRaw=1&deadline=1790000000&wallet=0x350035555E10d9AfAF1566AaebfCeD5BA6C27777','quote?side=buy&amountRaw=1','account?wallet=0x350035555E10d9AfAF1566AaebfCeD5BA6C27777']){
      const response=await fetch(base+'/api/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777/'+suffix);
      assert.equal(response.status,503);assert.equal((await response.json()).error.code,'FOUNDRY_NOT_CONFIGURED');
    }

    assert.equal((await(await fetch(base+'/api/market-index')).json()).configured,false);
    for(const suffix of ['history','stream']) {
      const result=await fetch(base+'/api/tokens/0x350035555E10d9AfAF1566AaebfCeD5BA6C27777/'+suffix);
      assert.equal(result.status,503);assert.equal((await result.json()).error.code,'FOUNDRY_INDEX_NOT_CONFIGURED');
    }
  } finally {
    await new Promise(resolve=>server.close(resolve));
    if(previous===undefined) delete process.env.FOUNDRY_FACTORY_ADDRESS;
    else process.env.FOUNDRY_FACTORY_ADDRESS=previous;
  }
});

test('preflight requires explicit nonzero wallet, minimum output and bounded timestamp syntax',()=>{
  const input={side:'buy',amountRaw:'1',wallet:'0x350035555E10d9AfAF1566AaebfCeD5BA6C27777',minOutputRaw:'1',deadline:'1790000000'};
  assert.equal(preflightInput(input).minOutputRaw,'1');
  for(const patch of [{wallet:null},{wallet:'0x0000000000000000000000000000000000000000'},{minOutputRaw:'0'},{deadline:'1e9'},{deadline:'1790000000.1'}])assert.throws(()=>preflightInput({...input,...patch}));
});

test('fee inspection requires literal nonzero wallet without granting authority',()=>{
  assert.equal(actionWallet('0x350035555e10d9afaf1566aaebfced5ba6c27777'),'0x350035555E10d9AfAF1566AaebfCeD5BA6C27777');
  for(const value of [null,'','invalid','0x0000000000000000000000000000000000000000'])assert.throws(()=>actionWallet(value));
});
