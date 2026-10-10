import { readTradePreflight } from '../../backend/src/trade-preflight.mjs';
import http from 'node:http';
import { openMarketStream } from '../../backend/src/market-stream.mjs';
import { marketBrowser } from './helpers/market-browser.mjs';
import { readCurveQuote, readTradeState, readTradeQuote } from '../../backend/src/trade-data.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Contract, ContractFactory, Interface, getCreateAddress, getCreate2Address, keccak256, zeroPadValue, parseEther, toBeHex, ZeroAddress } from 'ethers';
import { chain, nftAbi } from '../../backend/src/config.mjs';
import { candidates } from '../../backend/scripts/market-inspection.mjs';
import { MarketIndexer } from '../../backend/src/market-indexer.mjs';
import { readMarketWindow } from '../../backend/src/market-data.mjs';
import { withMonadFork } from './helpers/monad-fork.mjs';

test('real Monad hooked v4: four swap modes, funded fee transfer ownership and historical claims', { timeout: 180000 }, async () => {
  await withMonadFork(async ({ local, upstream, block }) => {
    const code = await upstream.getCode(candidates.poolManager, block.number);
    assert.notEqual(code, '0x'); assert.equal(await local.getCode(candidates.poolManager), code);
    const [deployer, buyer, treasury] = await Promise.all((await local.send('eth_accounts', [])).slice(0,3).map(a=>local.getSigner(a)));
    const nft = new Contract(chain.collection, [...nftAbi,'function transferFrom(address,address,uint256)'], local);
    const owner = await nft.ownerOf(1557n), buyerAddress = await buyer.getAddress();
    await local.send('anvil_impersonateAccount',[owner]); await local.send('anvil_setBalance',[owner,toBeHex(parseEther('10'))]);
    const creator = await local.getSigner(owner);
    const quote = new Contract(chain.quote,['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)','function approve(address,uint256) returns(bool)','function allowance(address,address) view returns(uint256)'],local);
    const v3 = new Contract(candidates.v3Factory,['function getPool(address,address,uint24) view returns(address)'],local);
    const holder=await v3.getPool(chain.quote,candidates.wrappedMon,3000);
    assert.notEqual(holder,ZeroAddress); assert.ok(await quote.balanceOf(holder)>=parseEther('3'));
    await local.send('anvil_impersonateAccount',[holder]); await local.send('anvil_setBalance',[holder,toBeHex(parseEther('10'))]);
    const holderSigner=await local.getSigner(holder);
    await(await quote.connect(holderSigner).transfer(owner,parseEther('2'))).wait();
    await(await quote.connect(holderSigner).transfer(buyerAddress,parseEther('1'))).wait();
    const compiled=JSON.parse(await readFile(new URL('../artifacts/contracts.json',import.meta.url),'utf8'));
    async function deploy(source,name,args){const a=compiled['src/'+source][name];const c=await new ContractFactory(a.abi,a.evm.bytecode.object,deployer).deploy(...args);await c.waitForDeployment();return c;}
    const deployerAddress=await deployer.getAddress(), nonce=await local.getTransactionCount(deployerAddress);
    const expectedMarket=getCreateAddress({from:deployerAddress,nonce:nonce+3});
    const expectedFactory=getCreateAddress({from:deployerAddress,nonce:nonce+4});
    // Execution scales only. LP fee and full-range policy are NOT approved deployment configuration.
    const hookDeployer=await deploy('StudioV4FeeHook.sol','StudioHookDeployer',[]);
    const expectedLock=getCreateAddress({from:deployerAddress,nonce:nonce+2});
    const h=compiled['src/StudioV4FeeHook.sol'].StudioV4FeeHook;
    const hookCreation=(await new ContractFactory(h.abi,h.evm.bytecode.object,deployer).getDeployTransaction(candidates.poolManager,chain.quote,expectedLock,expectedFactory,30,30,40)).data;
    const initHash=keccak256(hookCreation), hd=await hookDeployer.getAddress();
    let salt,hookAddress;
    for(let i=0;i<1000000;i++) {const candidate=zeroPadValue(toBeHex(i),32);const address=getCreate2Address(hd,candidate,initHash);if((BigInt(address)&0x3fffn)===0x20ccn){salt=candidate;hookAddress=address;break;}}
    assert.ok(hookAddress,'Mine actual CREATE2 permission bits, without code overrides');
    await(await hookDeployer.deploy(salt,hookCreation)).wait();
    const hook=new Contract(hookAddress,h.abi,local);
    const lock=await deploy('StudioV4LiquidityLock.sol','StudioV4LiquidityLock',[expectedMarket,chain.quote,candidates.poolManager,3000,hookAddress]);
    const lockAddress=await lock.getAddress();
    const market=await deploy('StudioCurveMarket.sol','StudioCurveMarket',[expectedFactory,chain.collection,chain.quote,parseEther('625000000'),1000000000n,4000000000n,lockAddress]);
    assert.equal(await market.getAddress(),expectedMarket);
    const factory=await deploy('StudioTokenFactory.sol','StudioTokenFactory',[chain.collection,chain.quote,expectedMarket,hookAddress,await treasury.getAddress()]);
    assert.equal(await factory.getAddress(),expectedFactory);
    const vault=new Contract(await factory.feeVault(),compiled['src/StudioFeeVault.sol'].StudioFeeVault.abi,local);
    const swapEvents=new Interface(['event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)']);
    async function checkHook(receipt) {
      const feeLog=receipt.logs.filter(l=>l.address.toLowerCase()===hookAddress.toLowerCase()).map(l=>{try{return hook.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='HookFee');
      const swapLog=receipt.logs.filter(l=>l.address.toLowerCase()===candidates.poolManager.toLowerCase()).map(l=>{try{return swapEvents.parseLog(l)}catch{return null}}).find(l=>l?.name==='Swap');
      assert.ok(feeLog); assert.ok(swapLog);
      const key=await lock.poolKey((await factory.launches(0)).token);
      const q=key.currency0.toLowerCase()===chain.quote.toLowerCase()?swapLog.args.amount0:swapLog.args.amount1;
      const base=q<0n?-q:q;
      assert.equal(feeLog.args.quoteBase,base);
      assert.equal(feeLog.args.creatorFee,base*30n/10000n);
      assert.equal(feeLog.args.studioFee,base*30n/10000n);
      const total=feeLog.args.creatorFee+feeLog.args.studioFee+feeLog.args.platformFee;
      const ideal=(base*100n+9999n)/10000n;
      assert.ok(total>=ideal-1n && total<=ideal+1n,'Only disclosed integer rounding may differ by one quote base unit');
      assert.equal(await quote.balanceOf(hookAddress),0n);
      assert.equal(await quote.balanceOf(await vault.getAddress()),await vault.liability());
      const creditLog=receipt.logs.filter(l=>l.address.toLowerCase()===(awaitVaultAddress).toLowerCase()).map(l=>{try{return vault.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='FeesCredited');
      assert.ok(creditLog); assert.equal(creditLog.args.recorder,hookAddress);
      assert.equal(creditLog.args.studioOwner,await nft.ownerOf(1557n));
    }
    const awaitVaultAddress=await vault.getAddress();
    const deadline=BigInt((await local.getBlock('latest')).timestamp+7200);
    await(await quote.connect(creator).approve(expectedFactory,parseEther('2'))).wait();
    await(await factory.connect(creator).launch({nftId:1557n,name:'Actual v4 graduation verification',symbol:'GRAD',initialQuoteIn:parseEther('2'),minTokenOut:1n,deadline})).wait();
    const launch=await factory.launches(0);
    const token=new Contract(launch.token,compiled['src/StudioToken.sol'].StudioToken.abi,local);
    assert.equal(await market.graduationReady(launch.token),true);
    const reserve=await market.totalReserve(), liability=await vault.liability();
    await assert.rejects(lock.connect(creator).seed.staticCall(launch.token,1n,1n));
    await assert.rejects(lock.connect(creator).unlockCallback.staticCall('0x'));
    const manager=new Contract(candidates.poolManager,compiled['src/StudioV4LiquidityLock.sol'].IV4PoolManager.abi,buyer);
    await assert.rejects(manager.initialize.staticCall(Array.from(await lock.poolKey(launch.token)),1n<<96n));
    const receipt=await(await market.connect(buyer).graduate(launch.token)).wait();
    assert.equal((await hook.pools((await lock.positions(launch.token)).poolId)).launchId,launch.launchId);
    assert.equal((await market.curves(launch.token)).graduated,true);
    const quoter=await deploy('StudioV4Quoter.sol','StudioV4Quoter',[lockAddress]);
    const quoterAddress=await quoter.getAddress();
    await assert.rejects(quoter.unlockCallback.staticCall('0x'));
    const unchanged=async()=>({liability:String(await vault.liability()),credited:String(await vault.totalCredited()),managerQuote:String(await quote.balanceOf(candidates.poolManager)),buyerQuote:String(await quote.balanceOf(buyerAddress)),buyerToken:String(await token.balanceOf(buyerAddress))});
    const beforeQuote=await unchanged();
    const firstQuote=await quoter.quoteExactInput.staticCall(launch.token,true,parseEther('0.01'),0);
    assert.ok(firstQuote.output>0n);assert.equal(firstQuote.input,parseEther('0.01'));assert.equal(firstQuote.lpFeeUnits,3000n);
    assert.deepEqual(await unchanged(),beforeQuote,'eth_call quote never changes funded fees or balances');
    const onchainQuoteReceipt=await(await quoter.quoteExactInput(launch.token,true,parseEther('0.01'),0)).wait();
    assert.equal(onchainQuoteReceipt.logs.length,0);
    assert.deepEqual(await unchanged(),beforeQuote,'Even an actual quoter transaction rolls back swap and vault changes');
    await assert.rejects(quoter.quoteExactInput.staticCall(launch.token,true,0,0));
    const preflightConfig=async()=>({chainId:31337,factoryAddress:expectedFactory,tokenAddress:launch.token,collection:chain.collection,quote:chain.quote,toBlock:(await local.getBlock('latest')).number,v4QuoterAddress:quoterAddress});
    const inspectInput={side:'buy',amountRaw:String(parseEther('0.01')),wallet:buyerAddress,minOutputRaw:String(firstQuote.output),deadline:String(Math.max(Math.floor(Date.now()/1000),(await local.getBlock('latest')).timestamp)+1800)};
    const blocked=await readTradePreflight(local,await preflightConfig(),inspectInput);
    assert.equal(blocked.preflight.status,'blocked');assert.ok(blocked.preflight.blockers.includes('APPROVAL_REQUIRED'));assert.equal(blocked.preflight.gasEstimateRaw,null);
    await(await quote.connect(buyer).approve(lockAddress,parseEther('0.01'))).wait();
    const settlement=await readTradePreflight(local,await preflightConfig(),inspectInput);
    assert.equal(settlement.preflight.status,'simulated');assert.equal(settlement.preflight.outputRaw,String(firstQuote.output));assert.ok(BigInt(settlement.preflight.gasEstimateRaw)>0n);assert.equal(settlement.preflight.executionEnabled,false);
    assert.deepEqual(await unchanged(),beforeQuote,'Settlement preflight does not change real fork state');
    const tooHigh=await readTradePreflight(local,await preflightConfig(),{...inspectInput,minOutputRaw:String(firstQuote.output+1n)});assert.ok(tooHigh.preflight.blockers.includes('MINIMUM_OUTPUT_EXCEEDS_QUOTE'));
    await assert.rejects(readTradePreflight(local,await preflightConfig(),{...inspectInput,deadline:'1'}),e=>e.code==='INVALID_DEADLINE');
    const buyBeforeQuote=await quote.balanceOf(buyerAddress),buyBeforeToken=await token.balanceOf(buyerAddress),creditBefore=await vault.totalCredited();
    const quoteSnapshot=await local.send('evm_snapshot',[]);
    await(await lock.connect(buyer).swap(launch.token,true,parseEther('0.01'),firstQuote.output,buyerAddress,deadline)).wait();
    assert.equal(buyBeforeQuote-await quote.balanceOf(buyerAddress),firstQuote.input);
    assert.equal(await token.balanceOf(buyerAddress)-buyBeforeToken,firstQuote.output);
    assert.equal(await vault.totalCredited()-creditBefore,firstQuote.creatorFee+firstQuote.studioFee+firstQuote.platformFee);
    const sellQuote=await quoter.quoteExactInput.staticCall(launch.token,false,firstQuote.output/2n,0);
    await(await token.connect(buyer).approve(lockAddress,firstQuote.output/2n)).wait();
    const sellSettlement=await readTradePreflight(local,await preflightConfig(),{...inspectInput,side:'sell',amountRaw:String(firstQuote.output/2n),minOutputRaw:String(sellQuote.output)});
    assert.equal(sellSettlement.preflight.outputRaw,String(sellQuote.output));assert.equal(sellSettlement.preflight.status,'simulated');
    const sellBeforeQuote=await quote.balanceOf(buyerAddress),sellBeforeToken=await token.balanceOf(buyerAddress);
    await(await lock.connect(buyer).swap(launch.token,false,firstQuote.output/2n,sellQuote.output,buyerAddress,deadline)).wait();
    assert.equal(await quote.balanceOf(buyerAddress)-sellBeforeQuote,sellQuote.output);
    assert.equal(sellBeforeToken-await token.balanceOf(buyerAddress),sellQuote.input);
    assert.equal(await local.send('evm_revert',[quoteSnapshot]),true);

    assert.equal(await market.totalReserve(),0n); assert.equal(await quote.balanceOf(expectedMarket),0n);
    assert.equal(await vault.liability(),liability); // No fee debt pays for migration.
    const position=await lock.positions(launch.token);
    assert.notEqual(position.poolId,'0x'+'00'.repeat(32)); assert.ok(position.liquidity>0n);
    assert.equal(position.quoteSeeded+position.quoteDust,reserve);
    assert.equal(position.tokenSeeded+position.tokenDust,parseEther('375000000'));
    assert.ok(receipt.logs.some(log=>log.address.toLowerCase()===candidates.poolManager.toLowerCase()));
    const stateView=new Contract(candidates.stateView,['function getSlot0(bytes32) view returns(uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)','function getLiquidity(bytes32) view returns(uint128)'],local);
    const slot0=await stateView.getSlot0(position.poolId);
    assert.equal(slot0.sqrtPriceX96,position.sqrtPriceX96); assert.equal(slot0.lpFee,3000n);
    assert.equal(await stateView.getLiquidity(position.poolId),position.liquidity);
    await assert.rejects(market.connect(buyer).graduate.staticCall(launch.token));
    await assert.rejects(market.getSellQuote(launch.token,1n));
    await(await quote.connect(buyer).approve(lockAddress,parseEther('0.01'))).wait();
    const creditsBefore=await vault.credits(owner);
    const quoteBefore=await quote.balanceOf(buyerAddress);
    await checkHook(await(await lock.connect(buyer).swap(launch.token,true,parseEther('0.001'),1n,buyerAddress,deadline)).wait());
    const purchased=await token.balanceOf(buyerAddress); assert.ok(purchased>0n);
    const creditsAfter=await vault.credits(owner);
    assert.ok(creditsAfter.creator>creditsBefore.creator); assert.ok(creditsAfter.studio>creditsBefore.studio);
    assert.equal(await quote.balanceOf(hookAddress),0n);
    // NFT changes before subsequent swap fees accrue.
    await(await nft.connect(creator).transferFrom(owner,buyerAddress,1557n)).wait();
    assert.ok(await quote.balanceOf(buyerAddress)<quoteBefore);
    await(await token.connect(buyer).approve(lockAddress,purchased)).wait();
    const beforeSell=await quote.balanceOf(buyerAddress);
    await checkHook(await(await lock.connect(buyer).swap(launch.token,false,purchased,1n,buyerAddress,deadline)).wait());
    assert.equal(await token.balanceOf(buyerAddress),0n); assert.ok(await quote.balanceOf(buyerAddress)>beforeSell);
    assert.equal((await vault.credits(owner)).studio,creditsAfter.studio);
    assert.ok((await vault.credits(buyerAddress)).studio>0n);
    assert.ok((await vault.credits(owner)).creator>creditsAfter.creator);
    // Buy exact token output and sell for exact quote output: the other two swap modes.
    await checkHook(await(await lock.connect(buyer).swapExactOutput(launch.token,true,parseEther('1000'),parseEther('0.001'),buyerAddress,deadline)).wait());
    assert.equal(await token.balanceOf(buyerAddress),parseEther('1000'));
    await(await token.connect(buyer).approve(lockAddress,parseEther('1000'))).wait();
    const beforeExact=await quote.balanceOf(buyerAddress);
    await checkHook(await(await lock.connect(buyer).swapExactOutput(launch.token,false,1000000000000n,parseEther('1000'),buyerAddress,deadline)).wait());
    assert.equal(await quote.balanceOf(buyerAddress)-beforeExact,1000000000000n);
    assert.equal(await quote.balanceOf(await vault.getAddress()),await vault.liability());
    // An independent caller/callback contract routes directly into PoolManager with the same key.
    const alternate=await deploy('StudioV4LiquidityLock.sol','StudioV4LiquidityLock',[expectedMarket,chain.quote,candidates.poolManager,3000,hookAddress]);
    const alternateAddress=await alternate.getAddress();
    assert.equal((await alternate.positions(launch.token)).poolId,'0x'+'00'.repeat(32));
    await(await quote.connect(buyer).approve(alternateAddress,parseEther('0.001'))).wait();
    const alternateBefore=await vault.credits(buyerAddress);
    await checkHook(await(await alternate.connect(buyer).swap(launch.token,true,parseEther('0.001'),1n,buyerAddress,deadline)).wait());
    assert.ok((await vault.credits(buyerAddress)).studio>alternateBefore.studio);
    // Tight real pool price limits cause partial execution, not fabricated quote data.
    const key = await lock.poolKey(launch.token);
    async function nearLimit(quoteIn) {
      const sqrt = (await stateView.getSlot0(position.poolId)).sqrtPriceX96;
      const input = quoteIn ? chain.quote : launch.token;
      const zeroForOne = key.currency0.toLowerCase() === input.toLowerCase();
      return zeroForOne ? sqrt - sqrt / 1000000000n : sqrt + sqrt / 1000000000n;
    }
    async function settlementState() {
      return {
        sqrt: (await stateView.getSlot0(position.poolId)).sqrtPriceX96,
        liquidity: await stateView.getLiquidity(position.poolId),
        buyerQuote: await quote.balanceOf(buyerAddress), buyerToken: await token.balanceOf(buyerAddress),
        lockQuote: await quote.balanceOf(lockAddress), lockToken: await token.balanceOf(lockAddress),
        managerQuote: await quote.balanceOf(candidates.poolManager), managerToken: await token.balanceOf(candidates.poolManager),
        hookQuote: await quote.balanceOf(hookAddress), vaultQuote: await quote.balanceOf(awaitVaultAddress),
        liability: await vault.liability(), creatorCredits: Array.from(await vault.credits(owner)),
        buyerCredits: Array.from(await vault.credits(buyerAddress)), treasuryCredits: Array.from(await vault.credits(await treasury.getAddress())),
        quoteAllowance: await quote.allowance(buyerAddress,lockAddress),
        tokenAllowance: await token.allowance(buyerAddress,lockAddress)
      };
    }
    async function rejectsAtomically(call, expectedSelector) {
      const before = await settlementState();
      await assert.rejects(call.staticCall(), error => {
        const data = error.data || error.info?.error?.data;
        assert.ok(typeof data === 'string' && data.toLowerCase().includes(expectedSelector.slice(2).toLowerCase()), 'Expected contract rejection, not transport or allowance failure');
        return true;
      });
      await assert.rejects(async()=>{await(await call.send({gasLimit:3000000})).wait();});
      assert.deepEqual(await settlementState(),before,'Reverted price-limited swap must restore settlement, credits and allowances');
    }
    const tokenBudget = parseEther('1000');
    assert.ok(await token.balanceOf(buyerAddress)>tokenBudget);
    await(await token.connect(buyer).approve(lockAddress,tokenBudget)).wait();
    const hookAmountError=hook.interface.getError('InvalidAmount').selector;
    let limit=await nearLimit(true);
    const partialBuy=[launch.token,true,parseEther('0.001'),1n,buyerAddress,deadline,limit];
    await rejectsAtomically({staticCall:()=>lock.connect(buyer).swapWithPriceLimit.staticCall(...partialBuy),send:overrides=>lock.connect(buyer).swapWithPriceLimit(...partialBuy,overrides)},hookAmountError);
    limit=await nearLimit(false);
    const partialQuoteOutput=[launch.token,false,1000000000000n,tokenBudget,buyerAddress,deadline,limit];
    await rejectsAtomically({staticCall:()=>lock.connect(buyer).swapExactOutputWithPriceLimit.staticCall(...partialQuoteOutput),send:overrides=>lock.connect(buyer).swapExactOutputWithPriceLimit(...partialQuoteOutput,overrides)},hookAmountError);
    // Token-specified exact-output cannot silently deliver less than requested.
    limit=await nearLimit(true);
    const partialTokenOutput=[launch.token,true,parseEther('1000'),parseEther('0.001'),buyerAddress,deadline,limit];
    await rejectsAtomically({staticCall:()=>lock.connect(buyer).swapExactOutputWithPriceLimit.staticCall(...partialTokenOutput),send:overrides=>lock.connect(buyer).swapExactOutputWithPriceLimit(...partialTokenOutput,overrides)},lock.interface.getError('Slippage').selector);
    // Token-specified exact-input may partially fill: fee uses actual quote and remainder refunds.
    const tokensBeforePartial=await token.balanceOf(buyerAddress), quoteBeforePartial=await quote.balanceOf(buyerAddress);
    limit=await nearLimit(false);
    const partialReceipt=await(await lock.connect(buyer).swapWithPriceLimit(launch.token,false,tokenBudget,1n,buyerAddress,deadline,limit)).wait();
    await checkHook(partialReceipt);
    const partialEvent=partialReceipt.logs.filter(l=>l.address.toLowerCase()===lockAddress.toLowerCase()).map(l=>{try{return lock.interface.parseLog(l)}catch{return null}}).find(l=>l?.name==='PoolTrade');
    assert.ok(partialEvent.args.amountIn>0n && partialEvent.args.amountIn<tokenBudget);
    assert.equal(tokensBeforePartial-await token.balanceOf(buyerAddress),partialEvent.args.amountIn);
    assert.equal(await quote.balanceOf(buyerAddress)-quoteBeforePartial,partialEvent.args.amountOut);
    assert.equal((await stateView.getSlot0(position.poolId)).sqrtPriceX96,limit);
    await assert.rejects(lock.connect(buyer).swapWithPriceLimit.staticCall(launch.token,true,1n,1n,buyerAddress,deadline,1n));
    await assert.rejects(lock.connect(buyer).swapWithPriceLimit.staticCall(launch.token,true,1n,1n,buyerAddress,0n,0n));
    // Slippage reverts PoolManager state and settlement, not just the frontend quote.
    const debtBeforeBad=await vault.liability();
    const beforeBad=await stateView.getSlot0(position.poolId), balanceBeforeBad=await quote.balanceOf(buyerAddress);
    await assert.rejects(async()=>{await(await lock.connect(buyer).swap(launch.token,true,parseEther('0.001'),parseEther('1000000000'),buyerAddress,deadline,{gasLimit:3000000})).wait();});
    assert.equal((await stateView.getSlot0(position.poolId)).sqrtPriceX96,beforeBad.sqrtPriceX96);
    assert.equal(await quote.balanceOf(buyerAddress),balanceBeforeBad);
    assert.equal(await vault.liability(),debtBeforeBad);
    assert.equal(await stateView.getLiquidity(position.poolId),position.liquidity);
    assert.ok(!lock.interface.fragments.some(f=>f.type==='function'&&/remove|withdraw|upgrade|rescue/i.test(f.name)));
    // NFT transfer cannot change position custody or erase old fee credits.
    const old=await vault.credits(owner), oldBalance=await quote.balanceOf(owner);
    await(await vault.connect(creator).claim()).wait();
    assert.equal(await quote.balanceOf(owner),oldBalance+old.creator+old.studio);
    assert.equal(await stateView.getLiquidity(position.poolId),position.liquidity);
    await assert.rejects(hook.connect(buyer).beforeInitialize.staticCall(lockAddress,Array.from(await lock.poolKey(launch.token)),position.sqrtPriceX96));
    assert.ok(!hook.interface.fragments.some(f=>f.type==='function'&&/swapExact|unlock|execute|rescue/i.test(f.name)), 'Hook exposes no self-swap route to v4 self-call exemption');
    const finalBlock=await local.getBlock('latest');
    const data=await readMarketWindow(local,{factoryAddress:expectedFactory,tokenAddress:launch.token,collection:chain.collection,quote:chain.quote,fromBlock:receipt.blockNumber,toBlock:finalBlock.number,intervalSeconds:60});
    const tradeConfig={factoryAddress:expectedFactory,tokenAddress:launch.token,collection:chain.collection,quote:chain.quote,toBlock:finalBlock.number};
    const accountState=await readTradeState(local,tradeConfig,buyerAddress);
    assert.equal(accountState.launch.graduated,true);
    await assert.rejects(readTradeQuote(local,tradeConfig,{side:'buy',amountRaw:String(parseEther('0.01'))}),error=>error.code==='V4_QUOTER_NOT_CONFIGURED');
    const configuredTrade={...tradeConfig,v4QuoterAddress:quoterAddress};
    const apiBuy=await readTradeQuote(local,configuredTrade,{side:'buy',amountRaw:String(parseEther('0.01')),wallet:buyerAddress});
    const actualBuy=await quoter.quoteExactInput.staticCall(launch.token,true,parseEther('0.01'),0,{blockTag:finalBlock.number});
    assert.equal(apiBuy.quote.outputRaw,String(actualBuy.output));assert.equal(apiBuy.quote.stage,'v4');
    assert.equal(apiBuy.quote.spender,lockAddress);assert.equal(apiBuy.fees.lpFeeUnits,3000);
    const apiSell=await readTradeQuote(local,configuredTrade,{side:'sell',amountRaw:String(10n**18n),wallet:buyerAddress});
    assert.ok(BigInt(apiSell.quote.outputRaw)>0n);
    await assert.rejects(readTradeQuote(local,{...configuredTrade,v4QuoterAddress:lockAddress},{side:'buy',amountRaw:'1'}));

    assert.equal(accountState.account.tokenBalanceRaw,String(await token.balanceOf(buyerAddress,{blockTag:finalBlock.number})));
    await assert.rejects(readCurveQuote(local,tradeConfig,{side:'buy',amountRaw:String(parseEther('0.01')),wallet:buyerAddress}),error=>error.code==='POST_GRADUATION_QUOTE_UNAVAILABLE');
    const managerLogs=await local.getLogs({address:candidates.poolManager,topics:[swapEvents.getEvent('Swap').topicHash,position.poolId],fromBlock:receipt.blockNumber,toBlock:finalBlock.number});
    assert.equal(data.trades.length,managerLogs.length);
    assert.equal(data.trades.length,6);
    assert.ok(data.trades.every(t=>t.stage==='v4'&&t.payer===null&&t.recipient===null));
    assert.ok(data.trades.some(t=>t.router===alternateAddress),'Independent routes must appear once in the PoolManager feed');
    assert.ok(data.trades.some(t=>t.side==='sell'));
    assert.ok(data.trades.some(t=>t.side==='buy'));
    assert.equal(new Set(data.trades.map(t=>t.id)).size,data.trades.length);
    assert.equal(data.candles.reduce((sum,c)=>sum+c.tradeCount,0),managerLogs.length);
    assert.equal(data.holders,null,'A post-graduation window cannot claim a complete holder census');
    const factoryDeployment=await factory.deploymentTransaction().wait();
    const indexer=new MarketIndexer(local,{chainId:31337,factoryAddress:expectedFactory,deploymentBlock:factoryDeployment.blockNumber,collection:chain.collection,quote:chain.quote},{databasePath:':memory:',localFork:true});
    try {
      await indexer.sync(10);
      const indexed=await indexer.market(launch.token);
      assert.equal(indexed.tradeCount,data.trades.length+1,'Full history includes the creator initial curve purchase and all six actual pool swaps');
      assert.equal(indexed.trades.filter(t=>t.stage==='v4').length,managerLogs.length);
      const poolHolder=indexed.holders.top.find(h=>h.role==='pool-manager');
      assert.ok(poolHolder);assert.equal(poolHolder.balanceRaw,String(await token.balanceOf(candidates.poolManager)));
      assert.equal(indexed.provenance.finality,'local-fork-latest','Local fork blocks must never be described as finalized Mainnet');
      if(process.env.PLAYWRIGHT_RUNTIME){
        const streams=new Set();let browser;
        const server=http.createServer(async(req,res)=>{
          try{
            const query=new URL(req.url,'http://127.0.0.1'),route=query.pathname;
            if(route.endsWith('/stream'))return await openMarketStream(req,res,indexer,launch.token,60,streams);
            let body;
            if(route==='/api/tokens')body={tokens:await indexer.store.tokens(),index:indexer.status()};
            else if(route===`/api/tokens/${launch.token}/history`)body=await indexer.market(launch.token);
            else if(route===`/api/tokens/${launch.token}/preflight`){
              body=await readTradePreflight(local,{...configuredTrade,chainId:31337},{side:query.searchParams.get('side'),amountRaw:query.searchParams.get('amountRaw'),wallet:query.searchParams.get('wallet'),minOutputRaw:query.searchParams.get('minOutputRaw'),deadline:query.searchParams.get('deadline')});body.provenance=indexed.provenance;
            }
            else if(route===`/api/tokens/${launch.token}/account`||route===`/api/tokens/${launch.token}/quote`){
              const wallet=query.searchParams.get('wallet');
              body=route.endsWith('/quote')?await readTradeQuote(local,configuredTrade,{side:query.searchParams.get('side'),amountRaw:query.searchParams.get('amountRaw'),wallet}):await readTradeState(local,tradeConfig,wallet);
              body.provenance=indexed.provenance;
            }else{res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Isolated real-state market API only.'}}));return;}
            res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(body));
          }catch(error){if(!res.headersSent)res.writeHead(error.status||500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:error.message}}));}
        });
        try{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await marketBrowser(`http://127.0.0.1:${server.address().port}`,launch.token,buyerAddress,{preflight:true});await browser.check(indexed,'v4');}
        finally{await browser?.close();for(const stream of streams)stream.end();await new Promise(resolve=>server.close(resolve));}
      }

    } finally {await indexer.close();}
    const report={mode:'isolated-real-state-fork',sourceChainId:143,localChainId:31337,blockNumber:block.number,blockHash:block.hash,poolManager:candidates.poolManager,poolManagerCodeHash:keccak256(code),poolId:position.poolId,actualPoolInitialization:true,actualLiquiditySettlement:true,actualBidirectionalSwaps:true,authenticatedInitialization:true,fourSwapModes:true,independentCallerFeeCapture:true,quoteSpecifiedPartialFillRollback:true,tokenExactOutputPartialFillRollback:true,tokenExactInputPartialFillRefund:true,priceLimitReached:true,actualPoolManagerTradeFeed:true,indexedCurveAndPoolHistory:true,feeOwnershipTransfer:true,withdrawalEntryPoint:false,postGraduationStudioFeeImplemented:true,hook:hookAddress,lpFeeTestUnits:3000,liveWrites:false};
    await writeFile(new URL('../artifacts/v4-hook.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
  });
});
