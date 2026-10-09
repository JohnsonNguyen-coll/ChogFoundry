import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Contract, ContractFactory, FetchRequest, JsonRpcProvider, id, parseEther, toBeHex } from 'ethers';
import { chain, nftAbi } from '../../backend/src/config.mjs';

const defaultAnvil = process.platform === 'win32'
  ? fileURLToPath(new URL('../../artifacts/evm-tools/node_modules/@foundry-rs/anvil-win32-amd64/bin/anvil.exe', import.meta.url))
  : 'anvil';

test('isolated real-state Monad fork: funded fees, NFT transfer and old-owner claims', { timeout: 180000 }, async () => {
  const upstreamRequest = new FetchRequest(chain.rpcUrl); upstreamRequest.timeout = 12000;
  const upstream = new JsonRpcProvider(upstreamRequest, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
  let child, local; let output = '';
  try {
    assert.equal(BigInt(await upstream.send('eth_chainId', [])), 143n);
    const block = await upstream.getBlock('finalized');
    assert.ok(block?.hash);
    const port = await new Promise((resolve, reject) => {
      const reservation = net.createServer(); reservation.once('error', reject);
      reservation.listen(0, '127.0.0.1', () => {
        const chosen = reservation.address().port;
        reservation.close(error => error ? reject(error) : resolve(chosen));
      });
    });
    child = spawn(process.env.ANVIL_BIN || defaultAnvil, [
      '--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337',
      '--fork-url', chain.rpcUrl, '--fork-block-number', String(block.number), '--silent'
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.on('data', data => { output += data.toString(); });
    let spawnError; child.on('error', error => { spawnError = error; });
    const localUrl = 'http://127.0.0.1:' + port;
    local = new JsonRpcProvider(localUrl, 31337, { staticNetwork: true, batchMaxCount: 1, cacheTimeout: -1 });
    local.pollingInterval = 100;
    let metadata;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error('Anvil exited: ' + output.slice(-1000));
      try { metadata = await local.send('anvil_metadata', []); break; } catch { await new Promise(resolve => setTimeout(resolve, 150)); }
    }
    assert.ok(metadata, 'Anvil must start. ' + output.slice(-1000));
    assert.equal(BigInt(await local.send('eth_chainId', [])), 31337n);
    assert.equal(Number(metadata.forkedNetwork?.chainId), 31337); // Anvil reports the overridden local chain ID.
    assert.equal(Number(metadata.forkedNetwork?.forkBlockNumber), block.number);
    assert.equal((await local.getBlock(block.number)).hash, block.hash);
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
  } finally {
    local?.destroy(); upstream.destroy();
    if (child?.pid && child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}); }
  }
});

