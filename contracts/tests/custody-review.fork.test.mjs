import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Contract, Wallet, id, parseEther, toBeHex } from 'ethers';
import { prepareDeployment, poolManager } from '../scripts/mainnet-plan.mjs';
import { mainnetEconomics as economics } from '../mainnet-config.mjs';
import { chain, nftAbi } from '../../backend/src/config.mjs';
import { withMonadFork } from './helpers/monad-fork.mjs';

// Regression: preserve literal-owner accounting without allowing NFT custody to halt trades.
test('vault custody preserves curve/v4 trading and hook deployment rejects front-running', { timeout: 180000 }, async () => {
  await withMonadFork(async ({ local, block }) => {
    const deployerAddress = Wallet.createRandom().address;
    await local.send('anvil_impersonateAccount', [deployerAddress]);
    await local.send('anvil_setBalance', [deployerAddress, toBeHex(parseEther('100'))]);
    const deployer = await local.getSigner(deployerAddress);
    const plan = await prepareDeployment(local, deployerAddress, { localFork: true });
    const outsiderAddress = Wallet.createRandom().address;
    await local.send('anvil_impersonateAccount', [outsiderAddress]);
    await local.send('anvil_setBalance', [outsiderAddress, toBeHex(parseEther('10'))]);
    const outsider = await local.getSigner(outsiderAddress);
    for (const [index, step] of plan.steps.entries()) {
      if (index === 1) {
        const nonceBefore = await local.getTransactionCount(deployerAddress);
        const helper = new Contract(step.to, ['function deployer() view returns(address)'], local);
        assert.equal(await helper.deployer(), deployerAddress);
        await assert.rejects(local.call({ from: outsiderAddress, to: step.to, data: step.data }), error =>
          error.data === id('Unauthorized()').slice(0, 10));
        await assert.rejects(async () => {
          const tx = await outsider.sendTransaction({ to: step.to, data: step.data, gasLimit: 10000000 });
          await tx.wait();
        });
        assert.equal(await local.getCode(step.creates), '0x');
        assert.equal(await local.getTransactionCount(deployerAddress), nonceBefore);
      }
      await (await deployer.sendTransaction(step.transaction)).wait();
      assert.notEqual(await local.getCode(step.creates), '0x');
    }
    const compiled = JSON.parse(await readFile(new URL('../artifacts/contracts.json', import.meta.url), 'utf8'));
    const bind = (name, address) => new Contract(address, compiled[`src/${name}.sol`][name].abi, deployer);
    const factory = bind('StudioTokenFactory', plan.addresses.factory);
    const market = bind('StudioCurveMarket', plan.addresses.market);
    const lock = bind('StudioV4LiquidityLock', plan.addresses.lock);
    const vault = bind('StudioFeeVault', await factory.feeVault());
    const vaultAddress = await vault.getAddress();
    const nft = new Contract(chain.collection, [...nftAbi, 'function transferFrom(address,address,uint256)'], local);
    const owner = await nft.ownerOf(1557n);
    for (const address of [owner, poolManager]) {
      await local.send('anvil_impersonateAccount', [address]);
      await local.send('anvil_setBalance', [address, toBeHex(parseEther('10'))]);
    }
    const creator = await local.getSigner(owner);
    const quote = new Contract(chain.quote, [
      'function balanceOf(address) view returns(uint256)',
      'function transfer(address,uint256) returns(bool)',
      'function approve(address,uint256) returns(bool)',
    ], local);
    const budget = parseEther('1600000');
    assert.ok(await quote.balanceOf(poolManager) >= budget + parseEther('100'));
    await (await quote.connect(await local.getSigner(poolManager)).transfer(owner, budget)).wait();
    await (await quote.connect(await local.getSigner(poolManager)).transfer(deployerAddress, parseEther('100'))).wait();
    const deadline = BigInt((await local.getBlock('latest')).timestamp + 3600);
    await (await quote.connect(creator).approve(plan.addresses.factory, budget)).wait();
    await (await factory.connect(creator).launch({ nftId: 1557n, name: 'Custody review', symbol: 'REVIEW', initialQuoteIn: parseEther('100'), minTokenOut: 1n, deadline })).wait();
    const launch = await factory.launches(0);
    const token = bind('StudioToken', launch.token).connect(creator);
    await (await token.approve(plan.addresses.market, await token.balanceOf(owner))).wait();
    await (await quote.connect(creator).approve(plan.addresses.market, budget)).wait();
    const input = parseEther('100');
    await market.connect(creator).sell.staticCall(launch.token, input, 1n, owner, deadline);
    const branch = await local.send('evm_snapshot', []);
    const creditBefore = Array.from(await vault.credits(owner));
    const reserveBefore = await market.totalReserve();
    await (await nft.connect(creator).transferFrom(owner, vaultAddress, 1557n)).wait();
    assert.equal(await nft.ownerOf(1557n), vaultAddress);
    const sellQuote = await market.getSellQuote(launch.token, input);
    const quoteBefore = await quote.balanceOf(owner);
    await (await market.connect(creator).sell(launch.token, input, sellQuote.quoteOut, owner, deadline)).wait();
    assert.equal(await quote.balanceOf(owner) - quoteBefore, sellQuote.quoteOut);
    assert.equal(await market.totalReserve(), reserveBefore - sellQuote.baseQuote);
    const buyQuote = await market.getBuyQuote(launch.token, input);
    const tokensBefore = await token.balanceOf(owner);
    await (await market.connect(creator).buy(launch.token, input, buyQuote.tokenOut, owner, deadline)).wait();
    assert.equal(await token.balanceOf(owner) - tokensBefore, buyQuote.tokenOut);
    assert.equal(await market.totalReserve(), reserveBefore - sellQuote.baseQuote + buyQuote.baseQuote);
    assert.equal((await vault.credits(owner)).studio, creditBefore[1]);
    assert.equal((await vault.credits(vaultAddress)).studio, sellQuote.studioFee + buyQuote.studioFee);
    assert.equal(await quote.balanceOf(vaultAddress), await vault.liability());
    const totalClaimedBefore = await vault.totalClaimed();
    const selfCredit = Array.from(await vault.credits(vaultAddress));
    await assert.rejects(vault.claimFor.staticCall(vaultAddress));
    assert.deepEqual(Array.from(await vault.credits(vaultAddress)), selfCredit);
    assert.equal(await vault.totalClaimed(), totalClaimedBefore);
    const oldCredit = Array.from(await vault.credits(owner));
    const oldBalance = await quote.balanceOf(owner);
    await (await vault.claimFor(owner)).wait();
    assert.equal(await quote.balanceOf(owner) - oldBalance, oldCredit.reduce((a, b) => a + b, 0n));
    await (await vault.claimFor(deployerAddress)).wait();
    const held = selfCredit.reduce((a, b) => a + b, 0n);
    assert.equal(await vault.liability(), held);
    assert.equal(await quote.balanceOf(vaultAddress), held);
    assert.equal(await vault.totalCredited() - await vault.totalClaimed(), held);
    assert.equal(await local.send('evm_revert', [branch]), true);
    await (await market.connect(creator).buy(launch.token, budget, 1n, owner, deadline)).wait();
    assert.equal(await market.totalReserve(), economics.targetReserveRaw);
    await (await market.graduate(launch.token)).wait();
    await (await quote.connect(deployer).approve(plan.addresses.lock, input)).wait();
    await lock.swap.staticCall(launch.token, true, input, 1n, deployerAddress, deadline);
    await (await nft.connect(creator).transferFrom(owner, vaultAddress, 1557n)).wait();
    const studioBefore = (await vault.credits(owner)).studio;
    const selfBefore = (await vault.credits(vaultAddress)).studio;
    const creditsBefore = await vault.totalCredited();
    const tokenOutBefore = await token.balanceOf(deployerAddress);
    await (await lock.swap(launch.token, true, input, 1n, deployerAddress, deadline)).wait();
    assert.ok(await token.balanceOf(deployerAddress) > tokenOutBefore);
    assert.ok((await vault.credits(vaultAddress)).studio > selfBefore);
    assert.equal((await vault.credits(owner)).studio, studioBefore);
    assert.ok(await vault.totalCredited() > creditsBefore);
    const buyerToken = token.connect(deployer);
    const sellInput = (await buyerToken.balanceOf(deployerAddress)) / 2n;
    await (await buyerToken.approve(plan.addresses.lock, sellInput)).wait();
    const beforeSell = await quote.balanceOf(deployerAddress);
    await (await lock.swap(launch.token, false, sellInput, 1n, deployerAddress, deadline)).wait();
    assert.ok(await quote.balanceOf(deployerAddress) > beforeSell);
    assert.equal(await quote.balanceOf(vaultAddress), await vault.liability());
    assert.equal(await vault.totalCredited() - await vault.totalClaimed(), await vault.liability());
    const lockedCredit = Array.from(await vault.credits(vaultAddress));
    await (await vault.claimFor(owner)).wait();
    await (await vault.claimFor(deployerAddress)).wait();
    assert.deepEqual(Array.from(await vault.credits(vaultAddress)), lockedCredit);
    assert.equal(await vault.liability(), lockedCredit.reduce((a, b) => a + b, 0n));
    assert.equal(await quote.balanceOf(vaultAddress), await vault.liability());
    assert.equal(await nft.ownerOf(1557n), vaultAddress);
    console.log(JSON.stringify({ findings: ['CF-01', 'CF-02'], sourceBlock: block.number, sourceHash: block.hash, curveBuySell: true, boundV4BuySell: true, historicalClaimWorks: true, selfCreditsFundedAndUnclaimable: true, unauthorizedHookDeploymentRejected: true, fixed: true, mainnetWrites: false }));
  });
});
