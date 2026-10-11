import { readApprovalPlan, readClaimPreflight } from './fee-actions.mjs';
import { Contract, FetchRequest, JsonRpcProvider, formatUnits, getAddress } from 'ethers';
import { chain, erc20Abi, nftAbi } from './config.mjs';
import { AppError } from './validation.mjs';
import { readTradePreflight } from './trade-preflight.mjs';
import { readTradeState, readTradeQuote } from './trade-data.mjs';
import { readMarketWindow } from './market-data.mjs';

export class ChainReader {
  constructor() {
    const request = new FetchRequest(chain.rpcUrl); request.timeout = 12000;
    this.provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
    this.quote = new Contract(chain.quote, erc20Abi, this.provider);
    this.nft = new Contract(chain.collection, nftAbi, this.provider);
    this.busy = false;
  }
  async snapshot(read, tag = 'latest') {
    if (this.busy) throw new AppError(429, 'READER_BUSY', 'The chain reader is busy. Please try again shortly.');
    this.busy = true;
    try {
      if (BigInt(await this.provider.send('eth_chainId', [])) !== BigInt(chain.id)) throw new AppError(503, 'CHAIN_MISMATCH', 'The RPC endpoint is not on Monad Mainnet.');
      const block = await this.provider.getBlock(tag);
      if (!block?.hash) throw new AppError(503, 'BLOCK_UNAVAILABLE', 'The current block is unavailable.');
      const result = await read(block.number);
      const canonical = await this.provider.getBlock(block.number);
      if (canonical?.hash !== block.hash) throw new AppError(503, 'CHAIN_REORG', 'The block changed during this read. Please reload.');
      return { ...result, provenance: {
        chainId: chain.id, blockNumber: block.number, blockHash: block.hash,
        blockTime: new Date(block.timestamp * 1000).toISOString(), fetchedAt: new Date().toISOString(),
        rpcOrigin: new URL(chain.rpcUrl).origin, source: 'Monad JSON-RPC', finality: tag
      } };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, 'RPC_READ_FAILED', 'Unable to read onchain data. No fallback data is available.');
    } finally { this.busy = false; }
  }
  async assertContracts(blockTag) {
    const [quoteCode, nftCode, supports721] = await Promise.all([
      this.provider.getCode(chain.quote, blockTag), this.provider.getCode(chain.collection, blockTag),
      this.nft.supportsInterface('0x80ac58cd', { blockTag })
    ]);
    if (quoteCode === '0x' || nftCode === '0x' || !supports721) throw new AppError(503, 'CONTRACT_MISMATCH', 'Contract bytecode or ERC-721 support does not match.');
    return { quoteCodeBytes: (quoteCode.length - 2) / 2, collectionCodeBytes: (nftCode.length - 2) / 2 };
  }
  overview() {
    return this.snapshot(async blockTag => {
      const bytecode = await this.assertContracts(blockTag);
      const [name, symbol, decimals, supply, nftName, nftSymbol, nftSupply] = await Promise.all([
        this.quote.name({ blockTag }), this.quote.symbol({ blockTag }), this.quote.decimals({ blockTag }), this.quote.totalSupply({ blockTag }),
        this.nft.name({ blockTag }), this.nft.symbol({ blockTag }), this.nft.totalSupply({ blockTag })
      ]);
      if (name !== 'Chog' || symbol !== 'CHOG' || Number(decimals) !== 18 || nftName !== 'Chog Genesis') throw new AppError(503, 'CONTRACT_IDENTITY_CHANGED', 'Contract metadata differs from the verified identity.');
      return {
        network: { chainId: chain.id, name: chain.name, currency: chain.symbol, explorer: chain.explorer },
        quote: { address: chain.quote, name, symbol, decimals: Number(decimals), totalSupplyRaw: String(supply), totalSupply: formatUnits(supply, decimals), source: chain.quoteSource },
        collection: { address: chain.collection, name: nftName, symbol: nftSymbol, totalSupply: String(nftSupply), erc721: true, source: chain.collectionSource },
        bytecode,
        foundry: { deployed: false, launchAvailable: false, tradeAvailable: false, claimAvailable: false, reason: 'Chog Foundry transaction flows are not publicly deployed. Final curve and graduation configuration remain pending.' }
      };
    });
  }
  studio(id) {
    return this.snapshot(async blockTag => {
      await this.assertContracts(blockTag);
      let owner, uri;
      try { [owner, uri] = await Promise.all([this.nft.ownerOf(id, { blockTag }), this.nft.tokenURI(id, { blockTag })]); }
      catch (error) {
        if (error.code === 'CALL_EXCEPTION') throw new AppError(404, 'NFT_NOT_FOUND', 'The NFT does not exist or the contract rejected the query.');
        throw error;
      }
      const ownerCode = await this.provider.getCode(owner, blockTag);
      return {
        nft: { collection: chain.collection, tokenId: String(id), owner, tokenURI: uri, ownerHasCode: ownerCode !== '0x' },
        studio: { key: `${chain.id}:${chain.collection.toLowerCase()}:${id}`, registration: 'unavailable', launchHistory: null, fees: null },
        // Has code includes smart wallets/EIP-7702; it does not establish custody or a beneficial owner.
        ownershipPolicy: 'Literal ownerOf only. No beneficial-owner inference. This response grants no authenticated permissions.'
      };
    });
  }
  wallet(wallet) {
    return this.snapshot(async blockTag => {
      await this.assertContracts(blockTag);
      const [mon, chog, count, decimals, ownedIds] = await Promise.all([
        this.provider.getBalance(wallet, blockTag), this.quote.balanceOf(wallet, { blockTag }),
        this.nft.balanceOf(wallet, { blockTag }), this.quote.decimals({ blockTag }),
        this.nft.tokensOfOwner(wallet, { blockTag })
      ]);
      const tokenIds = ownedIds.map(String);
      if (BigInt(tokenIds.length) !== count || new Set(tokenIds).size !== tokenIds.length) throw new AppError(503, 'NFT_DISCOVERY_MISMATCH', 'The NFT list does not match the onchain balance. Please reload.');
      return { wallet: getAddress(wallet), nfts: { collection: chain.collection, tokenIds, method: 'tokensOfOwner(address)', grantsAuthority: false }, balances: { mon: formatUnits(mon, 18), chog: formatUnits(chog, decimals), chogRaw: String(chog), nftCount: String(count) } };
    });
  }
  transfers(id, fromBlock, toBlock) {
    return this.snapshot(async latest => {
      const end = toBlock ?? latest; const start = fromBlock ?? Math.max(0, end - 99);
      if (end > latest || start > end || end - start >= 100) throw new AppError(400, 'INVALID_BLOCK_RANGE', 'Each query supports up to 100 blocks and cannot exceed the current block.');
      const logs = await this.nft.queryFilter(this.nft.filters.Transfer(null, null, id), start, end);
      return { range: { fromBlock: start, toBlock: end, completeHistory: false }, transfers: logs.map(log => ({
        from: log.args.from, to: log.args.to, tokenId: String(log.args.tokenId), blockNumber: log.blockNumber,
        blockHash: log.blockHash, transactionHash: log.transactionHash, transactionIndex: log.transactionIndex, logIndex: log.index
      })) };
    });
  }
  market(tokenAddress, fromBlock, toBlock, intervalSeconds) {
    const factoryAddress = process.env.FOUNDRY_FACTORY_ADDRESS;
    if (!factoryAddress) throw new AppError(503, 'FOUNDRY_NOT_CONFIGURED', 'No verified Chog Foundry factory is configured. Market data is unavailable.');
    return this.snapshot(async finalized => {
      const end = toBlock ?? finalized;
      if (end > finalized) throw new AppError(400, 'INVALID_BLOCK_RANGE', 'Market data cannot exceed the finalized block.');
      return readMarketWindow(this.provider, { factoryAddress, tokenAddress, collection: chain.collection, quote: chain.quote, fromBlock: fromBlock ?? Math.max(0, end - 99), toBlock: end, intervalSeconds });
    }, 'finalized');
  }
  tradeState(tokenAddress, wallet, input = null, preflight = false) {
    const factoryAddress=process.env.FOUNDRY_FACTORY_ADDRESS;
    if(!factoryAddress)throw new AppError(503,'FOUNDRY_NOT_CONFIGURED','No verified Foundry deployment is configured. Trade preparation is unavailable.');
    return this.snapshot(block=>{
      const config={chainId:chain.id,factoryAddress,tokenAddress,collection:chain.collection,quote:chain.quote,toBlock:block,v4QuoterAddress:process.env.FOUNDRY_V4_QUOTER_ADDRESS};
      if(preflight)return readTradePreflight(this.provider,config,{...input,wallet});
      return input?readTradeQuote(this.provider,config,{...input,wallet}):readTradeState(this.provider,config,wallet);
    },'finalized');
  }
  feeAction(tokenAddress,wallet,kind,input=null){
    const factoryAddress=process.env.FOUNDRY_FACTORY_ADDRESS;
    if(!factoryAddress)throw new AppError(503,'FOUNDRY_NOT_CONFIGURED','No verified Foundry deployment is configured. Fee actions are unavailable.');
    return this.snapshot(block=>{
      const config={chainId:chain.id,factoryAddress,tokenAddress,collection:chain.collection,quote:chain.quote,toBlock:block,v4QuoterAddress:process.env.FOUNDRY_V4_QUOTER_ADDRESS};
      return kind==='claim'?readClaimPreflight(this.provider,config,wallet):readApprovalPlan(this.provider,config,{...input,wallet});
    },'finalized');
  }
  anchor() { return this.snapshot(async () => ({}), 'finalized'); }
  ownerProof(id, session) {
    return this.snapshot(async current => {
      await this.assertContracts(current);
      const anchor = await this.provider.getBlock(session.anchor.blockNumber);
      if (anchor?.hash !== session.anchor.blockHash) throw new AppError(401, 'SESSION_REORG', 'The sign-in block is no longer canonical. Sign in again.');
      if (current < session.anchor.blockNumber || current - session.anchor.blockNumber > 1500) throw new AppError(401, 'SESSION_TOO_OLD', 'Sign in again before managing this studio.');
      const owner = await this.nft.ownerOf(id, { blockTag: current });
      if (owner.toLowerCase() !== session.wallet.toLowerCase()) throw new AppError(403, 'OWNER_REQUIRED', 'Only the current Chog NFT owner can manage this studio.');
      for (let start = session.anchor.blockNumber + 1; start <= current; start += 100) {
        const events = await this.nft.queryFilter(this.nft.filters.Transfer(null, null, id), start, Math.min(start + 99, current));
        if (events.length) throw new AppError(401, 'STUDIO_TRANSFERRED', 'This NFT transferred after sign-in. Sign in again; old permissions cannot be reused.');
      }
      return { owner, checkedSinceBlock: session.anchor.blockNumber };
    }, 'latest');
  }
  close() { this.provider.destroy(); }
}

