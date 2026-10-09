import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Contract, ContractFactory, id, parseEther, toBeHex } from 'ethers';
import { chain, nftAbi } from '../../backend/src/config.mjs';
import { withMonadFork } from './helpers/monad-fork.mjs';

test('isolated real-state Monad fork: funded fees, NFT transfer and old-owner claims', { timeout: 180000 }, async () => {
  await withMonadFork(async ({ local, upstream, block }) => {
    // All writes below use ONLY the child-owned, loopback Anvil fork.
    const accounts = await local.send('eth_accounts', []);
    const [registrar, nextOwner, curve, graduated, treasury, outsider] = await Promise.all(accounts.slice(0, 6).map(a => local.getSigner(a)));
    const nft = new Contract(chain.collection, [...nftAbi, 'function transferFrom(address,address,uint256)'], local);
    const quote = new Contract(chain.quote, [
      'function balanceOf(address) view returns(uint256)', 'function transfer(address,uint256) returns(bool)',
      'function approve(address,uint256) returns(bool)'
    ], local);
    const tokenId = 1557n;
    const originalOwner = await nft.ownerOf(tokenId);
    const sourceOwner = await new Contract(chain.collection, nftAbi, upstream).ownerOf(tokenId, { blockTag: block.number });
    assert.equal(originalOwner, sourceOwner);
    await local.send('anvil_impersonateAccount', [originalOwner]);
    await local.send('anvil_setBalance', [originalOwner, toBeHex(parseEther('10'))]);
    const originalSigner = await local.getSigner(originalOwner);
    const compiled = JSON.parse(await readFile(new URL('../artifacts/contracts.json', import.meta.url), 'utf8'));
    async function deploy(source, name, signer, args) {
      const artifact = compiled['src/' + source][name];
      const contract = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, signer).deploy(...args);
      await contract.waitForDeployment(); return contract;
    }
    const token = await deploy('StudioToken.sol', 'StudioToken', registrar, ['Fork verification token', 'FORK', parseEther('1000'), originalOwner]);
    const vault = await deploy('StudioFeeVault.sol', 'StudioFeeVault', registrar, [
      chain.collection, chain.quote, await registrar.getAddress(), await treasury.getAddress()
    ]);
    const vaultAddress = await vault.getAddress();
    const launchId = id('isolated-fork-accounting-test');
    const registration = [launchId, await token.getAddress(), tokenId, originalOwner, await curve.getAddress(), await graduated.getAddress()];
    await assert.rejects(vault.connect(outsider).registerLaunch.staticCall(...registration));
    await (await vault.registerLaunch(...registration)).wait();
    await assert.rejects(vault.registerLaunch.staticCall(...registration));
    await assert.rejects(vault.registerLaunch.staticCall(id('duplicate-token'), ...registration.slice(1)));
    // Fund recorders from an actual onchain holder discovered through the real V3 factory.
    const factory = new Contract('0x204faca1764b154221e35c0d20abb3c525710498', ['function getPool(address,address,uint24) view returns(address)'], local);
    const holder = await factory.getPool(chain.quote, '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', 3000);
    assert.ok(await quote.balanceOf(holder) >= 207n);
    await local.send('anvil_impersonateAccount', [holder]);
    await local.send('anvil_setBalance', [holder, toBeHex(parseEther('10'))]);
    const holderSigner = await local.getSigner(holder);
    for (const recorder of [curve, graduated]) {
      await (await quote.connect(holderSigner).transfer(await recorder.getAddress(), 100n)).wait();
      await (await quote.connect(recorder).approve(vaultAddress, 100n)).wait();
    }
    // Raw amounts exercise accounting; no fee rates or product defaults are selected.
    await assert.rejects(vault.connect(outsider).recordFees.staticCall(launchId, 3n, 5n, 2n));
    await assert.rejects(vault.connect(curve).recordFees.staticCall(id('unknown-launch'), 3n, 5n, 2n));
    await assert.rejects(vault.connect(curve).recordFees.staticCall(launchId, 0n, 0n, 0n));
    await (await vault.connect(curve).recordFees(launchId, 3n, 5n, 2n)).wait();
    assert.deepEqual(Array.from(await vault.credits(originalOwner)), [3n, 5n, 0n]);
    const b = await nextOwner.getAddress();
    await (await nft.connect(originalSigner).transferFrom(originalOwner, b, tokenId)).wait();
    await (await vault.connect(graduated).recordFees(launchId, 3n, 5n, 2n)).wait();
    assert.deepEqual(Array.from(await vault.credits(originalOwner)), [6n, 5n, 0n]);
    assert.deepEqual(Array.from(await vault.credits(b)), [0n, 5n, 0n]);
    assert.equal((await vault.launches(launchId)).creator, originalOwner);
    const beforeOldClaim = await quote.balanceOf(originalOwner);
    // Third party can trigger a claim, but cannot redirect old owner's assets.
    await (await vault.connect(outsider).claimFor(originalOwner)).wait();
    assert.equal(await quote.balanceOf(originalOwner), beforeOldClaim + 11n);
    await assert.rejects(vault.connect(outsider).claimFor.staticCall(originalOwner));
    // Round trip affects future studio fees; does not move B's recorded credit.
    await (await nft.connect(nextOwner).transferFrom(b, originalOwner, tokenId)).wait();
    await (await vault.connect(curve).recordFees(launchId, 0n, 1n, 0n)).wait();
    assert.deepEqual(Array.from(await vault.credits(b)), [0n, 5n, 0n]);
    assert.deepEqual(Array.from(await vault.credits(originalOwner)), [0n, 1n, 0n]);
    const liabilityBefore = await vault.liability();
    await (await quote.connect(holderSigner).transfer(vaultAddress, 7n)).wait();
    assert.equal(await vault.liability(), liabilityBefore);
    // Failed funding is atomic: no credit or liability changes.
    await (await quote.connect(curve).approve(vaultAddress, 0n)).wait();
    const oldCredit = Array.from(await vault.credits(originalOwner));
    const balanceBeforeFailure = await quote.balanceOf(vaultAddress);
    await assert.rejects(async () => {
      const tx = await vault.connect(curve).recordFees(launchId, 1n, 1n, 1n, { gasLimit: 400000 });
      await tx.wait();
    });
    assert.deepEqual(Array.from(await vault.credits(originalOwner)), oldCredit);
    assert.equal(await quote.balanceOf(vaultAddress), balanceBeforeFailure);
    assert.equal(await vault.liability(), liabilityBefore);
    for (const beneficiary of [b, originalOwner, await treasury.getAddress()]) {
      await (await vault.connect(outsider).claimFor(beneficiary)).wait();
    }
    assert.equal(await vault.liability(), 0n);
    assert.equal(await vault.totalCredited(), 21n);
    assert.equal(await vault.totalClaimed(), 21n);
    assert.equal(await quote.balanceOf(vaultAddress), 7n);
    assert.equal((await new Contract(chain.collection, nftAbi, upstream).ownerOf(tokenId, { blockTag: block.number })), originalOwner);
    console.log(JSON.stringify({ mode: 'isolated-real-state-fork', sourceChainId: 143, localChainId: 31337, forkBlock: block.number, blockHash: block.hash, nftId: String(tokenId), creditedRaw: '21', claimedRaw: '21', donationRaw: '7', mockContracts: false, liveWrites: false, marketOrAMMSwapTest: false }));
  });
});
