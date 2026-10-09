import test from 'node:test';
import assert from 'node:assert/strict';
import { Contract, FetchRequest, JsonRpcProvider, keccak256 } from 'ethers';
import { inspectMarkets, candidates } from '../scripts/market-inspection.mjs';
import { chain } from '../src/config.mjs';

test('market inspection matches real deployed bytecode and factory pool identities', { timeout: 120000 }, async () => {
  const report = await inspectMarkets();
  const request = new FetchRequest(chain.rpcUrl); request.timeout = 12000;
  const provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
  try {
    const blockTag = report.provenance.blockNumber;
    assert.equal(report.provenance.chainId, 143);
    assert.equal((await provider.getBlock(blockTag)).hash, report.provenance.blockHash);
    const quoteCode = await provider.getCode(chain.quote, blockTag);
    assert.equal(report.quote.codeHash, keccak256(quoteCode));
    const target = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(quoteCode)?.[1];
    assert.ok(target, 'The current CHOG contract is an ERC-1167 proxy.');
    assert.equal(report.quote.implementation.address.toLowerCase(), '0x' + target.toLowerCase());
    assert.equal(report.quote.implementation.codeHash, keccak256(await provider.getCode('0x' + target, blockTag)));
    for (const [name, candidate] of Object.entries(report.deployments)) {
      assert.equal(candidate.address.toLowerCase(), candidates[name].toLowerCase());
      assert.equal(candidate.codeHash, keccak256(await provider.getCode(candidate.address, blockTag)));
      assert.ok(candidate.codeBytes > 0);
    }
    const factory = new Contract(candidates.v3Factory, ['function getPool(address,address,uint24) view returns(address)'], provider);
    for (const pool of report.chogWrappedMonV3Pools) {
      const independent = await factory.getPool(chain.quote, candidates.wrappedMon, pool.feeTier, { blockTag });
      assert.equal(independent, pool.address || '0x0000000000000000000000000000000000000000');
    }
    assert.equal(report.foundry.configuredAMM, null);
    assert.equal(report.foundry.feeCaptureProven, false);
    assert.equal(report.quote.settlementReviewed, false);
  } finally { provider.destroy(); }
});
