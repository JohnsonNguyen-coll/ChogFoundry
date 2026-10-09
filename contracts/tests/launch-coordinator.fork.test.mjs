import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AbiCoder, Contract, ContractFactory, getCreateAddress, keccak256, parseEther, toBeHex, ZeroAddress } from 'ethers';
import { chain, nftAbi } from '../../backend/src/config.mjs';
import { withMonadFork } from './helpers/monad-fork.mjs';

test('launch coordinator: real NFT authority and atomic rollback for incompatible real market', { timeout: 180000 }, async () => {
  await withMonadFork(async ({ local }) => {
    const accounts = await local.send('eth_accounts', []);
    const [deployer, operator, treasury] = await Promise.all(accounts.slice(0, 3).map(a => local.getSigner(a)));
    const nft = new Contract(chain.collection, [...nftAbi, 'function approve(address,uint256)'], local);
    const nftId = 1557n, owner = await nft.ownerOf(nftId);
    await local.send('anvil_impersonateAccount', [owner]);
    await local.send('anvil_setBalance', [owner, toBeHex(parseEther('10'))]);
    const ownerSigner = await local.getSigner(owner);
    const compiled = JSON.parse(await readFile(new URL('../artifacts/contracts.json', import.meta.url), 'utf8'));
    const artifact = compiled['src/StudioTokenFactory.sol'].StudioTokenFactory;
    // Actual CHOG is deliberately an incompatible market: no fake market contract is deployed.
    // This validates rejection/rollback only, not a successful launch or swap integration.
    const factory = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, deployer).deploy(
      chain.collection, chain.quote, chain.quote, chain.quote, await treasury.getAddress());
    await factory.waitForDeployment();
    const factoryAddress = await factory.getAddress();
    const vault = new Contract(await factory.feeVault(), compiled['src/StudioFeeVault.sol'].StudioFeeVault.abi, local);
    assert.equal(await vault.registrar(), factoryAddress);
    assert.equal(await vault.quote(), chain.quote);
    assert.equal(await factory.TOKEN_SUPPLY(), parseEther('1000000000'));
    const deadline = BigInt((await local.getBlock('latest')).timestamp + 3600);
    const params = { nftId, name: 'Coordinator verification', symbol: 'CHECK', initialQuoteIn: 0n, minTokenOut: 0n, deadline };
    async function rejectsWith(call, name) {
      await assert.rejects(call, error => factory.interface.parseError(error.data)?.name === name);
    }
    await (await nft.connect(ownerSigner).approve(await operator.getAddress(), nftId)).wait();
    await rejectsWith(factory.connect(operator).launch.staticCall(params), 'OwnerRequired');
    await rejectsWith(factory.connect(ownerSigner).launch.staticCall({ ...params, deadline: 0n }), 'Expired');
    await rejectsWith(factory.connect(ownerSigner).launch.staticCall({ ...params, initialQuoteIn: 1n }), 'InvalidInitialBuy');
    await rejectsWith(factory.connect(ownerSigner).launch.staticCall({ ...params, minTokenOut: 1n }), 'InvalidInitialBuy');
    await rejectsWith(factory.connect(ownerSigner).launch.staticCall({ ...params, name: '' }), 'InvalidMetadata');
    const nonce = await local.getTransactionCount(factoryAddress);
    const tokenAddress = getCreateAddress({ from: factoryAddress, nonce });
    const launchId = keccak256(AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'uint256', 'address'], [31337n, factoryAddress, 0n, nftId, tokenAddress]));
    await assert.rejects(async () => {
      const tx = await factory.connect(ownerSigner).launch(params, { gasLimit: 5000000 });
      await tx.wait();
    });
    assert.equal(await factory.launchCount(), 0n);
    assert.equal(await local.getCode(tokenAddress), '0x');
    assert.equal(await local.getTransactionCount(factoryAddress), nonce);
    assert.equal((await vault.launches(launchId)).token, ZeroAddress);
    assert.equal(await vault.liability(), 0n);
    assert.equal(await nft.ownerOf(nftId), owner);
    console.log('Actual NFT approved operator denied; incompatible existing market reverted token deployment and vault registration. This negative suite does not exercise successful buys; see the curve integration suite.');
  });
});
