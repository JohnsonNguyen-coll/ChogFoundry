import { readClaimPreflight } from '../../backend/src/fee-actions.mjs';
import { readTradePreflight } from '../../backend/src/trade-preflight.mjs';
import { readTradeState, readCurveQuote } from '../../backend/src/trade-data.mjs';
import { marketBrowser } from './helpers/market-browser.mjs';
import { formatUnits } from 'ethers';
import { candleGeometry, fixedPrice, units as displayUnits } from '../../frontend/src/market-format.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Contract, ContractFactory, getCreateAddress, parseEther, toBeHex, ZeroAddress } from 'ethers';
import { chain, nftAbi } from '../../backend/src/config.mjs';
import { candidates } from '../../backend/scripts/market-inspection.mjs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PostgresMarketStore } from '../../backend/src/postgres-market-store.mjs';
import { MarketIndexer } from '../../backend/src/market-indexer.mjs';
import { openMarketStream } from '../../backend/src/market-stream.mjs';
import { readMarketWindow } from '../../backend/src/market-data.mjs';
import { withMonadFork } from './helpers/monad-fork.mjs';

test('actual CHOG/NFT: atomic first buy, curve swaps, fee ownership transfer and old claims', { timeout: 180000 }, async () => {
  await withMonadFork(async ({ local, upstream, block }) => {
    const accounts = await local.send('eth_accounts', []);
    const [deployer, buyer, treasury] = await Promise.all(accounts.slice(0, 3).map(a => local.getSigner(a)));
    const nft = new Contract(chain.collection, [...nftAbi, 'function transferFrom(address,address,uint256)'], local);
    const owner = await nft.ownerOf(1557n), buyerAddress = await buyer.getAddress();
    await local.send('anvil_impersonateAccount', [owner]);
    await local.send('anvil_setBalance', [owner, toBeHex(parseEther('10'))]);
    const creator = await local.getSigner(owner);
    const quote = new Contract(chain.quote, ['function balanceOf(address) view returns(uint256)', 'function transfer(address,uint256) returns(bool)', 'function approve(address,uint256) returns(bool)', 'function allowance(address,address) view returns(uint256)'], local);
    const v3 = new Contract(candidates.v3Factory, ['function getPool(address,address,uint24) view returns(address)'], local);
    const holder = await v3.getPool(chain.quote, candidates.wrappedMon, 3000);
    assert.notEqual(holder, ZeroAddress); assert.ok(await quote.balanceOf(holder) >= parseEther('5'));
    await local.send('anvil_impersonateAccount', [holder]);
    await local.send('anvil_setBalance', [holder, toBeHex(parseEther('10'))]);
    const holderSigner = await local.getSigner(holder);
    await (await quote.connect(holderSigner).transfer(owner, parseEther('2'))).wait();
    await (await quote.connect(holderSigner).transfer(buyerAddress, parseEther('3'))).wait();
    const compiled = JSON.parse(await readFile(new URL('../artifacts/contracts.json', import.meta.url), 'utf8'));
    async function deploy(source, name, args) {
      const a = compiled['src/' + source][name];
      const c = await new ContractFactory(a.abi, a.evm.bytecode.object, deployer).deploy(...args);
      await c.waitForDeployment(); return c;
    }
    const deployerAddress = await deployer.getAddress();
    const expectedFactory = getCreateAddress({ from: deployerAddress, nonce: await local.getTransactionCount(deployerAddress) + 1 });
    // Local execution scales, not approved product split, prices or graduation threshold.
    const S = parseEther('625000000'), p0 = 1000000000n, dp = 4000000000n;
    const market = await deploy('StudioCurveMarket.sol', 'StudioCurveMarket', [expectedFactory, chain.collection, chain.quote, S, p0, dp, ZeroAddress]);
    const marketAddress = await market.getAddress();
    const factory = await deploy('StudioTokenFactory.sol', 'StudioTokenFactory', [chain.collection, chain.quote, marketAddress, marketAddress, await treasury.getAddress()]);
    assert.equal(await factory.getAddress(), expectedFactory);
    const vault = new Contract(await factory.feeVault(), compiled['src/StudioFeeVault.sol'].StudioFeeVault.abi, local);
    const deadline = BigInt((await local.getBlock('latest')).timestamp + 7200);
    const params = { nftId: 1557n, name: 'Actual curve fork verification', symbol: 'CURVE', initialQuoteIn: parseEther('0.2'), minTokenOut: 1n, deadline };
    await (await quote.connect(creator).approve(expectedFactory, parseEther('2'))).wait();
    const creatorBefore = await quote.balanceOf(owner);
    const receipt = await (await factory.connect(creator).launch(params)).wait();
    const launch = await factory.launches(0);
    const token = new Contract(launch.token, compiled['src/StudioToken.sol'].StudioToken.abi, local);
    assert.equal(await token.totalSupply(), parseEther('1000000000'));
    assert.equal(await token.balanceOf(owner), launch.initialTokenOut);
    assert.ok(launch.initialTokenOut > 0n);
    assert.equal(creatorBefore - await quote.balanceOf(owner), launch.initialQuoteIn);
    assert.ok(launch.initialQuoteIn <= params.initialQuoteIn);
    assert.equal(await quote.balanceOf(expectedFactory), 0n);
    assert.equal(await quote.allowance(expectedFactory, marketAddress), 0n);
    assert.ok(receipt.logs.some(log => log.address.toLowerCase() === launch.token.toLowerCase()));
    const potential = x => p0*x/10n**18n + dp*x*x/(2n*S*10n**18n);
    const fees = base => { const c=base*30n/10000n, s=base*30n/10000n, total=(base*100n+9999n)/10000n; return [c,s,total-c-s]; };
    async function conserved() {
      assert.equal(await quote.balanceOf(marketAddress), await market.totalReserve());
      assert.equal(await quote.balanceOf(await vault.getAddress()), await vault.liability());
      const c = await market.curves(launch.token);
      assert.equal(c.reserve, potential(c.sold));
    }
    await conserved();
    await assert.rejects(market.connect(creator).initializeLaunch.staticCall(launch.launchId, launch.token, 1557n, owner, await vault.getAddress()));
    await assert.rejects(market.connect(buyer).buy.staticCall(launch.token, 1n, 1n, ZeroAddress, deadline));
    await assert.rejects(market.connect(buyer).buy.staticCall(launch.token, 1n, 1n, buyerAddress, 0n));
    // A buy failure must revert token creation and vault registration as well.
    const countBefore = await factory.launchCount(), creditedBefore = await vault.totalCredited();
    await assert.rejects(async () => { await (await factory.connect(creator).launch({ ...params, minTokenOut: parseEther('1000000001') }, { gasLimit: 6000000 })).wait(); });
    assert.equal(await factory.launchCount(), countBefore); assert.equal(await vault.totalCredited(), creditedBefore);
    await conserved();
    await (await factory.connect(creator).launch({ ...params, initialQuoteIn: 0n, minTokenOut: 0n })).wait();
    const emptyLaunch = await factory.launches(1);
    const emptyToken = new Contract(emptyLaunch.token, token.interface, local);
    assert.equal(await emptyToken.balanceOf(owner), 0n);
    assert.equal(await emptyToken.balanceOf(marketAddress), parseEther('1000000000'));
    await (await quote.connect(buyer).approve(marketAddress, parseEther('3'))).wait();
    const preview = await market.getBuyQuote(launch.token, parseEther('0.3'));
    const curveBefore = await market.curves(launch.token);
    assert.equal(preview.baseQuote, potential(curveBefore.sold + preview.tokenOut) - potential(curveBefore.sold));
    assert.deepEqual([preview.creatorFee,preview.studioFee,preview.platformFee],fees(preview.baseQuote));
    const inspectConfig={chainId:31337,factoryAddress:expectedFactory,tokenAddress:launch.token,collection:chain.collection,quote:chain.quote,toBlock:(await local.getBlock('latest')).number};
    const settlementBefore={reserve:await market.totalReserve(),liability:await vault.liability(),balance:await quote.balanceOf(buyerAddress)};
    const settlement=await readTradePreflight(local,inspectConfig,{side:'buy',amountRaw:String(parseEther('0.3')),wallet:buyerAddress,minOutputRaw:String(preview.tokenOut),deadline:String(Math.max(Math.floor(Date.now()/1000),(await local.getBlock('latest')).timestamp)+1800)});
    assert.equal(settlement.preflight.status,'simulated');assert.equal(settlement.preflight.outputRaw,String(preview.tokenOut));assert.ok(BigInt(settlement.preflight.gasEstimateRaw)>0n);
    assert.deepEqual({reserve:await market.totalReserve(),liability:await vault.liability(),balance:await quote.balanceOf(buyerAddress)},settlementBefore);
    const reserveBeforeSlippage = await market.totalReserve();
    await assert.rejects(async () => { await (await market.connect(buyer).buy(launch.token, parseEther('0.3'), preview.tokenOut + 1n, buyerAddress, deadline, { gasLimit: 3000000 })).wait(); });
    assert.equal(await market.totalReserve(), reserveBeforeSlippage);
    await (await market.connect(buyer).buy(launch.token, parseEther('0.3'), preview.tokenOut, buyerAddress, deadline)).wait();
    assert.equal(await token.balanceOf(buyerAddress), preview.tokenOut); await conserved();
    const oldCredit = await vault.credits(owner);
    await (await nft.connect(creator).transferFrom(owner, buyerAddress, 1557n)).wait();
    await assert.rejects(factory.connect(creator).launch.staticCall({ ...params, initialQuoteIn: 0n, minTokenOut: 0n }));
    const sellAmount = preview.tokenOut / 2n;
    const sellQuote = await market.getSellQuote(launch.token, sellAmount);
    await (await token.connect(buyer).approve(marketAddress, sellAmount)).wait();
    const sellSettlement=await readTradePreflight(local,{...inspectConfig,toBlock:(await local.getBlock('latest')).number},{side:'sell',amountRaw:String(sellAmount),wallet:buyerAddress,minOutputRaw:String(sellQuote.quoteOut),deadline:settlement.preflight.deadline});
    assert.equal(sellSettlement.preflight.status,'simulated');assert.equal(sellSettlement.preflight.outputRaw,String(sellQuote.quoteOut));
    await (await market.connect(buyer).sell(launch.token, sellAmount, sellQuote.quoteOut, buyerAddress, deadline)).wait();
    const nowOld = await vault.credits(owner), nowNew = await vault.credits(buyerAddress);
    assert.equal(nowOld.studio, oldCredit.studio);
    assert.equal(nowOld.creator, oldCredit.creator + sellQuote.creatorFee);
    assert.equal(nowNew.studio, sellQuote.studioFee);
    await conserved();
    const creditBlock=await local.getBlock('latest');
    const historicalAccount=await readTradeState(local,{factoryAddress:expectedFactory,tokenAddress:launch.token,collection:chain.collection,quote:chain.quote,toBlock:creditBlock.number},owner);
    assert.equal(historicalAccount.account.feeCredits.studioRaw,String(oldCredit.studio));
    assert.ok(BigInt(historicalAccount.account.feeCredits.studioRaw)>0n);
    assert.equal(historicalAccount.beneficiaries.studioOwnerAtSnapshot,buyerAddress);
    const claimConfig={...inspectConfig,toBlock:(await local.getBlock('latest')).number};
    const claimBefore={credits:Array.from(await vault.credits(owner)),liability:await vault.liability(),balance:await quote.balanceOf(owner)};
    const oldClaim=await readClaimPreflight(local,claimConfig,owner);
    assert.equal(oldClaim.claim.status,'simulated');assert.equal(oldClaim.claim.beneficiary,owner);assert.equal(oldClaim.claim.credits.totalRaw,String(nowOld.creator+nowOld.studio));assert.ok(BigInt(oldClaim.claim.gasEstimateRaw)>0n);
    assert.deepEqual({credits:Array.from(await vault.credits(owner)),liability:await vault.liability(),balance:await quote.balanceOf(owner)},claimBefore);
    const noClaim=await readClaimPreflight(local,claimConfig,await deployer.getAddress());assert.equal(noClaim.claim.status,'nothing-to-claim');assert.equal(noClaim.claim.gasEstimateRaw,null);
    const beforeClaim = await quote.balanceOf(owner);
    await (await creator.sendTransaction(oldClaim.claim.transaction)).wait();
    assert.equal(await quote.balanceOf(owner), beforeClaim + nowOld.creator + nowOld.studio);
    await conserved();
    // Fill actual sale inventory; readiness is not an AMM migration. Redemption stays available.
    const fill = await market.getBuyQuote(launch.token, parseEther('3'));
    await (await market.connect(buyer).buy(launch.token, parseEther('3'), fill.tokenOut, buyerAddress, deadline)).wait();
    assert.equal(await market.graduationReady(launch.token), true);
    assert.equal((await market.curves(launch.token)).reserve, await market.targetReserve());
    await (await token.connect(buyer).approve(marketAddress, 10n**18n)).wait();
    const redemption = await market.getSellQuote(launch.token, 10n**18n);
    await (await market.connect(buyer).sell(launch.token, 10n**18n, redemption.quoteOut, buyerAddress, deadline)).wait();
    assert.equal(await market.graduationReady(launch.token), false); await conserved();
    // Capped first buy refunds excess CHOG and never gives an allocation.
    assert.ok(await quote.balanceOf(holder) >= parseEther('2'));
    await (await quote.connect(holderSigner).transfer(buyerAddress, parseEther('2'))).wait();
    await (await quote.connect(buyer).approve(expectedFactory, parseEther('2'))).wait();
    const cappedBefore = await quote.balanceOf(buyerAddress);
    await (await factory.connect(buyer).launch({ ...params, initialQuoteIn: parseEther('2') })).wait();
    const capped = await factory.launches(2);
    assert.equal(capped.initialTokenOut, S);
    const expectedCapCost = potential(S) + fees(potential(S)).reduce((a,b)=>a+b,0n);
    assert.equal(capped.initialQuoteIn, expectedCapCost);
    assert.equal(cappedBefore - await quote.balanceOf(buyerAddress), expectedCapCost);
    assert.equal(await quote.balanceOf(expectedFactory), 0n);
    assert.equal(await quote.allowance(expectedFactory, marketAddress), 0n);
    await conserved();
    // Unrelated donations cannot create fee credits or reserves.
    const creditedBeforeDonation = await vault.totalCredited(), reserveBeforeDonation = await market.totalReserve();
    await (await quote.connect(holderSigner).transfer(marketAddress, 7n)).wait();
    assert.equal(await market.totalReserve(), reserveBeforeDonation);
    assert.equal(await vault.totalCredited(), creditedBeforeDonation);
    assert.equal(await quote.balanceOf(marketAddress), reserveBeforeDonation + 7n);
    // The backend consumes the actual executed logs and constructor mint, without seeded data.
    const end=await local.getBlock('latest');
    const data=await readMarketWindow(local,{factoryAddress:expectedFactory,tokenAddress:launch.token,collection:chain.collection,quote:chain.quote,fromBlock:receipt.blockNumber,toBlock:end.number,intervalSeconds:60});
    const actualTrades=await market.queryFilter(market.filters.Traded(launch.token),receipt.blockNumber,end.number);
    assert.equal(data.trades.length,actualTrades.length);
    assert.equal(data.trades.length,5);
    assert.equal(data.trades[0].payer,expectedFactory);
    assert.equal(data.trades[0].recipient,owner);
    assert.equal(data.trades.at(-1).side,'sell');
    assert.equal(data.snapshot.blockHash,end.hash);
    assert.equal(data.holders.count,3);
    assert.ok(data.holders.top.some(h=>h.role==='curve'),'Inventory is a protocol holding, not a user wallet');
    assert.equal(data.holders.top.find(h=>h.wallet===owner).balanceRaw,String(await token.balanceOf(owner)));
    const volume=actualTrades.reduce((sum,l)=>sum+l.args.baseQuote,0n);
    assert.equal(data.candles.reduce((sum,c)=>sum+BigInt(c.quoteVolumeRaw),0n),volume);
    for(const candle of data.candles) {
      const events=data.trades.filter(t=>Math.floor(t.timestamp/60)*60===candle.time);
      assert.equal(candle.tradeCount,events.length);
      // Independent exact integer price from actual RPC events, not Number approximations.
      const prices=events.map(t=>BigInt(t.quoteBaseRaw)*10n**36n/BigInt(t.tokenAmountRaw));
      const units=value=>{const [a,b='']=value.split('.');return BigInt(a)*10n**36n+BigInt(b.padEnd(36,'0'));};
      assert.equal(units(candle.open),prices[0]); assert.equal(units(candle.close),prices.at(-1));
      assert.equal(units(candle.high),prices.reduce((a,b)=>a>b?a:b)); assert.equal(units(candle.low),prices.reduce((a,b)=>a<b?a:b));
    }
    // Frontend chart geometry and exact display values use actual executed trade data.
    const geometry=candleGeometry(data.candles);
    assert.ok(geometry);
    for(const candle of geometry.values) {
      assert.equal(candle.o,fixedPrice(candle.open));
      for(const value of [candle.o,candle.h,candle.l,candle.c]) {
        assert.ok(Number.isFinite(geometry.y(value)));
        assert.ok(geometry.y(value)>=35&&geometry.y(value)<=245);
      }
      assert.ok(Number.isFinite(geometry.x(candle.time)));
    }
    assert.equal(candleGeometry([]),null);
    assert.equal(displayUnits(data.trades[0].tokenAmountRaw).replaceAll(',',''),
      formatUnits(BigInt(data.trades[0].tokenAmountRaw),18).replace(/\.0$/, ''));
    const tradeConfig={factoryAddress:expectedFactory,tokenAddress:launch.token,collection:chain.collection,quote:chain.quote,toBlock:end.number};
    const buyPreview=await readCurveQuote(local,tradeConfig,{side:'buy',amountRaw:String(parseEther('0.01')),wallet:buyerAddress});
    const directBuy=await market.getBuyQuote(launch.token,parseEther('0.01'),{blockTag:end.number});
    assert.equal(buyPreview.quote.actualInputRaw,String(directBuy.quoteSpent));
    assert.equal(buyPreview.quote.outputRaw,String(directBuy.tokenOut));
    assert.equal(buyPreview.quote.unusedBudgetRaw,String(parseEther('0.01')-directBuy.quoteSpent));
    assert.equal(buyPreview.beneficiaries.studioOwnerAtSnapshot,await nft.ownerOf(1557n,{blockTag:end.number}));
    assert.equal(buyPreview.beneficiaries.creator,owner);
    assert.equal(buyPreview.account.tokenBalanceRaw,String(await token.balanceOf(buyerAddress,{blockTag:end.number})));
    assert.equal(buyPreview.account.quoteAllowanceRaw,String(await quote.allowance(buyerAddress,marketAddress,{blockTag:end.number})));
    const sellPreview=await readCurveQuote(local,tradeConfig,{side:'sell',amountRaw:String(10n**18n),wallet:buyerAddress});
    const directSell=await market.getSellQuote(launch.token,10n**18n,{blockTag:end.number});
    assert.equal(sellPreview.quote.outputRaw,String(directSell.quoteOut));
    assert.equal(sellPreview.quote.totalFeeRaw,String(directSell.creatorFee+directSell.studioFee+directSell.platformFee));
    const oldAccount=await readTradeState(local,tradeConfig,owner),oldCredits=await vault.credits(owner,{blockTag:end.number});
    assert.equal(oldAccount.account.feeCredits.creatorRaw,String(oldCredits.creator));
    assert.equal(oldAccount.account.feeCredits.studioRaw,String(oldCredits.studio));
    assert.equal(oldAccount.account.feeCredits.totalRaw,String(oldCredits.creator+oldCredits.studio+oldCredits.platform));
    assert.equal((await readCurveQuote(local,tradeConfig,{side:'buy',amountRaw:String(parseEther('0.01'))})).quote.balanceSufficient,null);
    await assert.rejects(readCurveQuote(local,tradeConfig,{side:'sell',amountRaw:String(10n**30n)}),e=>e.code==='INVALID_TRADE_AMOUNT');
    const recent=await readMarketWindow(local,{factoryAddress:expectedFactory,tokenAddress:launch.token,collection:chain.collection,quote:chain.quote,fromBlock:end.number,toBlock:end.number,intervalSeconds:60});
    assert.equal(recent.holders,null); assert.deepEqual(recent.candles,[]);
    // Another real ERC-20 is not a registered Foundry launch.
    await assert.rejects(readMarketWindow(local,{factoryAddress:expectedFactory,tokenAddress:chain.quote,collection:chain.collection,quote:chain.quote,fromBlock:receipt.blockNumber,toBlock:end.number}),e=>e.code==='MARKET_BINDING_MISMATCH');
    // Actual fork events executed through the PostgreSQL repository on a real WASM engine.
    const sqlEngine=new PGlite();let pgIndexer;
    try {
      await sqlEngine.exec(await readFile(new URL('../../backend/supabase/migrations/001_foundry.sql',import.meta.url),'utf8'));
      const deployment=await factory.deploymentTransaction().wait();
      pgIndexer=new MarketIndexer(local,{chainId:31337,factoryAddress:expectedFactory,deploymentBlock:deployment.blockNumber,collection:chain.collection,quote:chain.quote},{localFork:true,storeFactory:config=>new PostgresMarketStore(config,sqlEngine)});
      await pgIndexer.sync(10);
      const stored=await pgIndexer.market(launch.token);
      assert.equal(stored.tradeCount,data.trades.length);assert.deepEqual(stored.candles,data.candles);
      assert.equal(stored.holders.count,data.holders.count);
      const head=await pgIndexer.store.head();
      await assert.rejects(pgIndexer.store.commit(head.end_block,head.end_block,await local.getBlock(head.end_block),[]),e=>e.code==='INDEX_GAP');
      assert.equal((await pgIndexer.market(launch.token)).tradeCount,data.trades.length);
      await pgIndexer.store.rollback(deployment.blockNumber-1);
      assert.equal(await pgIndexer.store.head(),null);assert.deepEqual(await pgIndexer.store.tokens(),[]);
      await pgIndexer.sync(10);assert.equal((await pgIndexer.market(launch.token)).tradeCount,data.trades.length);
    } finally {await pgIndexer?.close();await sqlEngine.close();}
    // Persistent backfill and a genuine local fork branch change, not mocked logs.
    await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
    const folder=await mkdtemp(fileURLToPath(new URL('../artifacts/market-index-',import.meta.url)));
    const db=folder+'/markets.sqlite';
    const deploymentReceipt=await factory.deploymentTransaction().wait();
    const indexConfig={chainId:31337,factoryAddress:expectedFactory,deploymentBlock:deploymentReceipt.blockNumber,collection:chain.collection,quote:chain.quote};
    let indexer=new MarketIndexer(local,indexConfig,{databasePath:db,localFork:true});
    let streamServer,controller,browser;const streams=new Set();
    try {
      assert.equal((await indexer.sync(10)).caughtUp,true);
      const indexed=await indexer.market(launch.token);
      assert.equal(indexed.tradeCount,data.trades.length);
      assert.deepEqual(indexed.candles,data.candles);
      assert.equal(indexed.holders.count,data.holders.count);
      const stableCursor=indexed.cursor;
      await indexer.sync(10);
      assert.equal((await indexer.market(launch.token)).cursor,stableCursor,'Repeated sync does not duplicate events or revise an unchanged checkpoint');
      await indexer.close();indexer=new MarketIndexer(local,indexConfig,{databasePath:db,localFork:true});
      assert.equal(indexer.store.market(launch.token).tradeCount,data.trades.length,'Actual SQLite persists across restart');
      assert.throws(()=>new MarketIndexer(local,{...indexConfig,collection:chain.quote},{databasePath:db,localFork:true}),e=>e.code==='INDEX_CONFIG_CHANGED');
      const wrongNetwork=new MarketIndexer(upstream,indexConfig,{databasePath:':memory:'});
      try {await assert.rejects(wrongNetwork.sync(),e=>e.code==='CHAIN_MISMATCH');} finally {await wrongNetwork.close();}
      const branch=await local.send('evm_snapshot',[]);
      await(await token.connect(buyer).approve(marketAddress,10n**18n)).wait();
      const branchQuote=await market.getSellQuote(launch.token,10n**18n);
      const branchReceipt=await(await market.connect(buyer).sell(launch.token,10n**18n,branchQuote.quoteOut,buyerAddress,deadline)).wait();
      await local.send('anvil_mine',['0x78']);
      await indexer.sync(10);
      const changed=await indexer.market(launch.token);
      assert.equal(changed.tradeCount,data.trades.length+1);
      const walletChanged=await indexer.walletHistory(launch.token,buyerAddress);assert.equal(walletChanged.walletActivity.balanceRaw,String(await token.balanceOf(buyerAddress)));assert.ok(walletChanged.walletActivity.trades.some(t=>t.transactionHash===branchReceipt.hash));
      assert.ok(changed.range.toBlock-changed.range.fromBlock>100,'Persisted history spans multiple RPC windows');
      assert.equal(changed.holders.top.find(h=>h.wallet===buyerAddress.toLowerCase()).balanceRaw,String(await token.balanceOf(buyerAddress)));
      // Exercise the actual HTTP SSE implementation and replay an orphaned cursor.
      streamServer=http.createServer(async (req,res)=>{
        try {
          const route=new URL(req.url,'http://127.0.0.1').pathname;
          if(route==='/'||route.endsWith('/stream'))return await openMarketStream(req,res,indexer,launch.token,60,streams);
          let body;
          if(route==='/api/tokens')body={tokens:await indexer.store.tokens(),index:indexer.status()};
          else if(route===`/api/tokens/${launch.token}/history`)body=await indexer.market(launch.token,60);
          else if(route===`/api/tokens/${launch.token}/wallet-history`)body=await indexer.walletHistory(launch.token,new URL(req.url,'http://127.0.0.1').searchParams.get('wallet'));
          else if(route===`/api/tokens/${launch.token}/quote`){
            const query=new URL(req.url,'http://127.0.0.1').searchParams,head=await indexer.store.head();
            const config={...indexConfig,tokenAddress:launch.token,toBlock:head.end_block};
            body=await readCurveQuote(local,config,{side:query.get('side'),amountRaw:query.get('amountRaw'),wallet:query.get('wallet')});
            body.provenance={chainId:31337,blockNumber:head.end_block,blockHash:head.end_hash,blockTime:head.block_time,finality:'local-fork-latest',rpcOrigin:new URL(local._getConnection().url).origin,fetchedAt:new Date().toISOString()};
          }

          else if(route===`/api/tokens/${launch.token}/account`){
            const query=new URL(req.url,'http://127.0.0.1').searchParams,head=await indexer.store.head();
            body=await readTradeState(local,{...indexConfig,tokenAddress:launch.token,toBlock:head.end_block},query.get('wallet'));
            body.provenance={chainId:31337,blockNumber:head.end_block,blockHash:head.end_hash,blockTime:head.block_time,finality:'local-fork-latest',rpcOrigin:new URL(local._getConnection().url).origin,fetchedAt:new Date().toISOString()};
          }
          else {res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'This isolated test API only serves actual indexed markets.'}}));return;}
          res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body));
        }catch(error){if(!res.headersSent)res.writeHead(error.status||500);res.end();}
      });
      await new Promise(resolve=>streamServer.listen(0,'127.0.0.1',resolve));
      const url=`http://127.0.0.1:${streamServer.address().port}`;
      browser=await marketBrowser(url,launch.token,buyerAddress);
      if(browser)await browser.check(changed,'populated');
      controller=new AbortController();
      const response=await fetch(url,{signal:controller.signal});
      assert.equal(response.headers.get('content-type'),'text/event-stream; charset=utf-8');
      const streamReader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
      async function event() {
        for(;;) {
          const boundary=buffer.indexOf('\n\n');
          if(boundary>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(frame.startsWith(':'))continue;return {type:frame.match(/event: (.+)/)[1],data:JSON.parse(frame.match(/data: (.+)/)[1])};}
          const result=await streamReader.read();assert.equal(result.done,false);buffer+=decoder.decode(result.value,{stream:true});
        }
      }
      assert.equal((await event()).data.tradeCount,changed.tradeCount);
      assert.equal(await local.send('evm_revert',[branch]),true);
      await indexer.sync(10);
      const reset=await event();assert.equal(reset.type,'reset');
      assert.equal(reset.data.tradeCount,data.trades.length);
      assert.ok(!reset.data.trades.some(t=>t.transactionHash===branchReceipt.hash),'Orphaned trades disappear from authoritative stream snapshot');
      assert.equal(reset.data.holders.top.find(h=>h.wallet===buyerAddress.toLowerCase()).balanceRaw,String(await token.balanceOf(buyerAddress)));
      assert.notEqual(reset.data.cursor,changed.cursor);
      const walletReset=await indexer.walletHistory(launch.token,buyerAddress);assert.equal(walletReset.walletActivity.trades.some(t=>t.transactionHash===branchReceipt.hash),false);assert.equal(walletReset.walletActivity.balanceRaw,String(await token.balanceOf(buyerAddress)));
      if(browser)await browser.reset(reset.data,branchReceipt.hash);
      controller.abort();
      const replayController=new AbortController();
      try {
        const replay=await fetch(url,{headers:{'Last-Event-ID':changed.cursor},signal:replayController.signal});
        const r=replay.body.getReader();let text='';while(!text.includes('\n\n')){const chunk=await r.read();text+=decoder.decode(chunk.value);}
        const snapshot=JSON.parse(text.match(/data: (.+)/)[1]);
        assert.equal(snapshot.tradeCount,data.trades.length);assert.notEqual(snapshot.cursor,changed.cursor);
      } finally {replayController.abort();}
      await indexer.close();indexer=new MarketIndexer(local,indexConfig,{databasePath:db,localFork:true});
      assert.equal((await indexer.market(launch.token)).tradeCount,data.trades.length,'Rollback persists across restart');
    } finally {
      await browser?.close();
      controller?.abort();for(const stream of streams) stream.end();
      if(streamServer) await new Promise(resolve=>streamServer.close(resolve));
      await indexer.close();
    }
    console.log(JSON.stringify({ forkBlock:block.number, actualInitialBuy:true, actualCurveBuySell:true, transferFeeOwnership:true, oldCreatorClaim:true, zeroAllocation:true, actualMarketData:true, actualCandles:true, actualHolderReplay:true, postgresRepository:true, persistentIndex:true, realBranchRollback:true, actualSSE:true, graduation:false, liveWrites:false }));
  });
});
