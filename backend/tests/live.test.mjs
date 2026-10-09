import test from 'node:test';
import assert from 'node:assert/strict';
import { Contract, JsonRpcProvider } from 'ethers';
import { chain, erc20Abi, nftAbi } from '../src/config.mjs';
import { createApi } from '../src/server.mjs';

test('live API matches independent RPC reads at recorded Monad blocks; no mocks', { timeout: 120000 }, async () => {
  const { server } = createApi({ databasePath: ':memory:' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const provider = new JsonRpcProvider(chain.rpcUrl, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
  async function read(route) {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(30000) });
    const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body;
  }
  try {
    const overview = await read('/api/overview');
    assert.equal(overview.provenance.chainId, 143);
    assert.equal(overview.foundry.deployed, false);
    assert.equal(overview.quote.symbol, 'CHOG'); assert.equal(overview.quote.decimals, 18);
    const quote = new Contract(chain.quote, erc20Abi, provider);
    assert.equal(String(await quote.totalSupply({ blockTag: overview.provenance.blockNumber })), overview.quote.totalSupplyRaw);
    assert.equal((await provider.getBlock(overview.provenance.blockNumber)).hash, overview.provenance.blockHash);
    // A real token observed on OpenSea/RPC during source verification; owner is never hardcoded.
    const tokenId = process.env.LIVE_TOKEN_ID || '1557';
    const studio = await read(`/api/studios/${tokenId}`);
    const nft = new Contract(chain.collection, nftAbi, provider);
    assert.equal(await nft.ownerOf(tokenId, { blockTag: studio.provenance.blockNumber }), studio.nft.owner);
    assert.equal(await nft.tokenURI(tokenId, { blockTag: studio.provenance.blockNumber }), studio.nft.tokenURI);
    assert.equal(studio.studio.fees, null);
    const wallet = await read(`/api/wallets/${studio.nft.owner}`);
    assert.equal(String(await quote.balanceOf(studio.nft.owner, { blockTag: wallet.provenance.blockNumber })), wallet.balances.chogRaw);
    const transfers = await read(`/api/studios/${tokenId}/transfers`);
    assert.equal(transfers.range.completeHistory, false);
    const events = await nft.queryFilter(nft.filters.Transfer(null, null, tokenId), transfers.range.fromBlock, transfers.range.toBlock);
    assert.deepEqual(transfers.transfers.map(tx => tx.transactionHash), events.map(tx => tx.transactionHash));
    const missing = await fetch(`${base}/api/studios/${2n ** 256n - 1n}`);
    assert.equal(missing.status, 404);
    console.log(JSON.stringify({ liveChainId: 143, quoteBlock: overview.provenance.blockNumber, collection: chain.collection, testedTokenId: tokenId, observedOwner: studio.nft.owner, checkedAt: studio.provenance.fetchedAt }));
  } finally { provider.destroy(); await new Promise(resolve => server.close(resolve)); }
});
