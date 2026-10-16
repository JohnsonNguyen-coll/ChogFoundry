import test from 'node:test';
import assert from 'node:assert/strict';
import { Contract, parseEther, toBeHex, getAddress } from 'ethers';
import { readFile } from 'node:fs/promises';
import { prepareDeployment, poolManager } from '../scripts/mainnet-plan.mjs';
import { mainnetEconomics as e } from '../mainnet-config.mjs';
import { chain, nftAbi } from '../../backend/src/config.mjs';
import { readTradeQuote } from '../../backend/src/trade-data.mjs';
import { withMonadFork } from './helpers/monad-fork.mjs';

test('approved Mainnet scale: unsigned deployment plan, 1.5M CHOG graduation, actual v4 fees and transfer claims', {timeout:180000}, async()=>{
  await withMonadFork(async({local,block})=>{
    const accounts=(await local.send('eth_accounts',[])).map(getAddress),deployer=await local.getSigner(accounts[0]),buyer=await local.getSigner(accounts[1]);
    const plan=await prepareDeployment(local,accounts[0],{localFork:true});
    assert.equal(plan.treasury,accounts[0]);assert.equal(plan.steps.length,6);assert.equal(plan.executionEnabled,false);
    for(const step of plan.steps){const receipt=await(await deployer.sendTransaction(step.transaction)).wait();assert.equal(receipt.status,1);assert.notEqual(await local.getCode(step.creates),'0x');}
    const compiled=JSON.parse(await readFile(new URL('../artifacts/contracts.json',import.meta.url),'utf8'));
    const contract=(file,address)=>new Contract(address,compiled['src/'+file+'.sol'][file].abi,local);
    const market=contract('StudioCurveMarket',plan.addresses.market),factory=contract('StudioTokenFactory',plan.addresses.factory),lock=contract('StudioV4LiquidityLock',plan.addresses.lock);
    const vault=contract('StudioFeeVault',await factory.feeVault());
    assert.equal(await market.saleSupply(),e.saleSupplyRaw);assert.equal(await market.openingPrice(),e.openingPriceRaw);assert.equal(await market.priceIncrease(),e.priceIncreaseRaw);assert.equal(await market.targetReserve(),e.targetReserveRaw);assert.equal(await lock.lpFee(),3000n);assert.equal(await vault.treasury(),accounts[0]);
    const nft=new Contract(chain.collection,[...nftAbi,'function transferFrom(address,address,uint256)'],local),owner=await nft.ownerOf(1557n);
    const quote=new Contract(chain.quote,['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)','function approve(address,uint256) returns(bool)'],local);
    // Funding comes from an actual verified CHOG holder, solely on this disposable fork.
    // No ERC20 storage override, mint, mock token, upstream transfer or owner signature claim.
    assert.ok(await quote.balanceOf(poolManager)>=parseEther('1601000'),'Actual source holder must fund reviewed scale; no invented balance fallback');
    for(const address of [poolManager,owner]){await local.send('anvil_impersonateAccount',[address]);await local.send('anvil_setBalance',[address,toBeHex(parseEther('10'))]);}
    const source=await local.getSigner(poolManager),creator=await local.getSigner(owner);
    await(await quote.connect(source).transfer(owner,parseEther('1600000'))).wait();await(await quote.connect(source).transfer(accounts[1],parseEther('1000'))).wait();
    const deadline=BigInt((await local.getBlock('latest')).timestamp+3600);
    await(await quote.connect(creator).approve(plan.addresses.factory,parseEther('1600000'))).wait();
    const before=await quote.balanceOf(owner);
    await(await factory.connect(creator).launch({nftId:1557n,name:'Approved economics fork proof',symbol:'PROOF',initialQuoteIn:parseEther('1600000'),minTokenOut:e.saleSupplyRaw,deadline})).wait();
    const launch=await factory.launches(0),token=contract('StudioToken',launch.token);
    assert.equal(launch.initialQuoteIn,parseEther('1515000'));assert.equal(before-await quote.balanceOf(owner),launch.initialQuoteIn);assert.equal(launch.initialTokenOut,e.saleSupplyRaw);assert.equal(await token.totalSupply(),e.supplyRaw);assert.equal(await market.totalReserve(),e.targetReserveRaw);assert.equal(await market.graduationReady(launch.token),true);
    await(await market.connect(buyer).graduate(launch.token)).wait();
    assert.equal((await market.curves(launch.token)).graduated,true);assert.equal(await market.totalReserve(),0n);
    const position=await lock.positions(launch.token);assert.ok(position.liquidity>0n);assert.equal(position.quoteSeeded+position.quoteDust,e.targetReserveRaw);assert.equal(position.tokenSeeded+position.tokenDust,e.graduationInventoryRaw);
    await(await quote.connect(buyer).approve(plan.addresses.lock,parseEther('1000'))).wait();
    const readConfig=async()=>({chainId:31337,factoryAddress:plan.addresses.factory,tokenAddress:launch.token,collection:chain.collection,quote:chain.quote,toBlock:(await local.getBlock('latest')).number,v4QuoterAddress:plan.addresses.quoter});
    const preview=await readTradeQuote(local,await readConfig(),{side:'buy',amountRaw:String(parseEther('100')),wallet:accounts[1]});
    const held=await token.balanceOf(accounts[1]);await(await lock.connect(buyer).swap(launch.token,true,parseEther('100'),BigInt(preview.quote.outputRaw),accounts[1],deadline)).wait();assert.equal(await token.balanceOf(accounts[1])-held,BigInt(preview.quote.outputRaw));
    const oldStudio=(await vault.credits(owner)).studio;
    await(await nft.connect(creator).transferFrom(owner,accounts[1],1557n)).wait();
    await(await lock.connect(buyer).swap(launch.token,true,parseEther('50'),1n,accounts[1],deadline)).wait();
    assert.equal((await vault.credits(owner)).studio,oldStudio);assert.ok((await vault.credits(accounts[1])).studio>0n);
    const credits=await vault.credits(owner),claimBalance=await quote.balanceOf(owner);
    await(await vault.connect(deployer).claimFor(owner)).wait();assert.equal(await quote.balanceOf(owner)-claimBalance,credits.creator+credits.studio+credits.platform);assert.equal(await quote.balanceOf(await vault.getAddress()),await vault.liability());
    console.log(JSON.stringify({sourceBlock:block.number,approvedEconomics:true,reserveCHOG:'1500000',actualOfficialV4:true,treasuryEqualsDeployer:true,unsignedPlanExecutedLocally:true,oldOwnerClaim:true,mainnetWrites:false}));
  });
});
