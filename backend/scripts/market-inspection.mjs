import { Contract, encodeBase58, getAddress, keccak256 } from 'ethers';
import { chain, erc20Abi } from '../src/config.mjs';
import { PooledReadProvider } from '../src/rpc-pool.mjs';

// Research candidates from official deployment tables; NOT settlement configuration.
export const candidates = Object.freeze({
  poolManager: '0x188d586ddcf52439676ca21a244753fa19f9ea8e',
  stateView: '0x77395f3b2e73ae90843717371294fa97cc419d64',
  positionManager: '0x5b7ec4a94ff9bedb700fb82ab09d5846972f4016',
  quoter: '0xa222dd357a9076d1091ed6aa2e16c9742dd26891',
  v3Factory: '0x204faca1764b154221e35c0d20abb3c525710498',
  wrappedMon: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A'
});
const sources = {
  v4: 'https://developers.uniswap.org/docs/protocols/v4/deployments',
  v3: 'https://developers.uniswap.org/docs/protocols/v3/deployments/v3-monad-deployments',
  quote: chain.quoteSource
};

export async function inspectMarkets() {
  const provider = new PooledReadProvider();
  try {
    if (BigInt(await provider.send('eth_chainId', [])) !== 143n) throw new Error('Expected Monad Mainnet, chain ID 143.');
    const block = await provider.getBlock('finalized');
    if (!block?.hash) throw new Error('A finalized block is required.');
    const blockTag = block.number;
    async function codeInfo(address) {
      const code = await provider.getCode(address, blockTag);
      return { address: getAddress(address), codeBytes: (code.length - 2) / 2, codeHash: keccak256(code), code };
    }
    async function optionalRead(target, signature, args = []) {
      const contract = new Contract(target, [signature], provider);
      const name = signature.match(/function ([^(]+)/)[1];
      try { return { status: 'read', value: String(await contract[name](...args, { blockTag })) }; }
      catch (error) {
        // Unsupported methods are unknown, never evidence that no admin exists.
        if (error.code !== 'CALL_EXCEPTION') throw error;
        return { status: 'unavailable', value: null, reason: 'Call reverted; method support and permissions are unknown.' };
      }
    }
    const quoteCode = await codeInfo(chain.quote);
    const match = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(quoteCode.code);
    const implementation = match ? await codeInfo('0x' + match[1]) : null;
    const metadata = implementation?.code.match(/697066735822(1220[0-9a-f]{64})/i);
    const quote = new Contract(chain.quote, erc20Abi, provider);
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      quote.name({ blockTag }), quote.symbol({ blockTag }), quote.decimals({ blockTag }), quote.totalSupply({ blockTag })
    ]);
    const deployments = {};
    for (const [role, address] of Object.entries(candidates)) {
      const { code, ...info } = await codeInfo(address);
      if (!info.codeBytes) throw new Error('Candidate has no bytecode: ' + role);
      deployments[role] = { ...info, evidence: 'Official address table + live bytecode; deployed source equivalence not verified.' };
    }
    const managerOwner = await optionalRead(candidates.poolManager, 'function owner() view returns(address)');
    const protocolFeeController = await optionalRead(candidates.poolManager, 'function protocolFeeController() view returns(address)');
    const factory = new Contract(candidates.v3Factory, ['function getPool(address,address,uint24) view returns(address)'], provider);
    const pools = [];
    // Standard V3 tiers are lookup keys only, not Foundry fee proposals.
    for (const feeTier of [100, 500, 3000, 10000]) {
      const address = await factory.getPool(chain.quote, candidates.wrappedMon, feeTier, { blockTag });
      if (address === '0x0000000000000000000000000000000000000000') { pools.push({ feeTier, address: null }); continue; }
      const pool = new Contract(address, [
        'function token0() view returns(address)', 'function token1() view returns(address)',
        'function fee() view returns(uint24)', 'function liquidity() view returns(uint128)'
      ], provider);
      const [token0, token1, fee, liquidity] = await Promise.all([
        pool.token0({ blockTag }), pool.token1({ blockTag }), pool.fee({ blockTag }), pool.liquidity({ blockTag })
      ]);
      const expected = [chain.quote, candidates.wrappedMon].map(x => x.toLowerCase()).sort();
      if ([token0, token1].map(x => x.toLowerCase()).sort().join() !== expected.join() || Number(fee) !== feeTier) throw new Error('V3 pool identity mismatch.');
      pools.push({ feeTier, address, token0, token1, activeLiquidityRaw: String(liquidity) });
    }
    const { code: ignoredCollection, ...collectionCode } = await codeInfo(chain.collection);
    const collectionState = {};
    for (const signature of [
      'function maxSupply() view returns(uint256)', 'function reserveMax() view returns(uint256)',
      'function revealed() view returns(bool)', 'function baseURI() view returns(string)',
      'function treasury() view returns(address)', 'function ADMIN_ROLE() view returns(bytes32)'
    ]) collectionState[signature.match(/function ([^(]+)/)[1]] = await optionalRead(chain.collection, signature);
    const ownerProbe = await optionalRead(chain.quote, 'function owner() view returns(address)');
    if ((await provider.getBlock(blockTag))?.hash !== block.hash) throw new Error('The inspected block is no longer canonical.');
    const { code: ignoredQuote, ...quoteInfo } = quoteCode;
    const { code: ignoredImplementation, ...implementationInfo } = implementation || {};
    return {
      provenance: { chainId: 143, blockNumber: blockTag, blockHash: block.hash, blockTime: new Date(block.timestamp * 1000).toISOString(), fetchedAt: new Date().toISOString(), rpcOrigin: 'Monad public RPC pool', rpcSources:provider.pool.sources(), finality: 'finalized', source: 'Monad JSON-RPC' },
      sources,
      quote: { ...quoteInfo, name, symbol, decimals: Number(decimals), totalSupplyRaw: String(totalSupply),
        proxyStandard: match ? 'ERC-1167' : null, implementation: implementation ? implementationInfo : null,
        compilerMetadataCID: metadata ? encodeBase58('0x' + metadata[1]) : null,
        ownerProbe,
        settlementReviewed: false
      },
      collection: { ...collectionCode, source: 'https://monadscan.com/address/' + chain.collection + '#code', state: collectionState, review: 'Explorer-published ChogMint source inspected; not independently recompiled or audited.' },
      deployments, managerOwner, protocolFeeController, chogWrappedMonV3Pools: pools,
      foundry: { configuredAMM: null, hookDeployed: false, graduatedPool: null, feeCaptureProven: false },
      blockers: ['CHOG implementation source and transfer behavior are not verified.', 'No Foundry hook, market or graduated pool exists.', 'Real fork/testnet swaps and ownership-transfer fee tests are outstanding.', 'Curve, fees, graduation and LP policy need user-approved decisions.']
    };
  } finally { provider.destroy(); }
}
