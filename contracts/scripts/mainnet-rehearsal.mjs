// Offline/local execution evidence only. The sole write client is the guarded child fork.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Contract, formatEther, getAddress, keccak256, parseEther, toBeHex } from 'ethers';
import { withMonadFork } from '../tests/helpers/monad-fork.mjs';
import { chain } from '../../backend/src/config.mjs';

const planPath = new URL('../artifacts/mainnet-deployment-plan.json', import.meta.url);
const plan = JSON.parse(await readFile(planPath, 'utf8'));
const wallet = getAddress(process.env.FOUNDRY_DEPLOYER_ADDRESS || '');
assert.equal(plan.deployer, wallet);
assert.equal(plan.treasury, wallet);
assert.equal(plan.chainId, 143);
assert.equal(plan.collection.address.toLowerCase(), chain.collection.toLowerCase());
assert.equal(plan.steps.length, 6);
const compiled = JSON.parse(await readFile(new URL('../artifacts/contracts.json', import.meta.url), 'utf8'));
await withMonadFork(async ({ local, upstream, block }) => {
  assert.equal(await upstream.getCode(wallet, 'latest'), '0x');
  assert.equal(await upstream.getTransactionCount(wallet, 'latest'), plan.steps[0].nonce);
  assert.equal(await upstream.getTransactionCount(wallet, 'pending'), plan.steps[0].nonce);
  assert.equal((await upstream.getBlock(plan.source.blockNumber)).hash, plan.source.blockHash);
  assert.equal(await local.getTransactionCount(wallet), plan.steps[0].nonce, 'Finalized fork nonce must match the actual public plan');
  const actualBalance = await upstream.getBalance(wallet, block.number);
  const fees = await upstream.getFeeData();
  assert.ok(fees.gasPrice !== null && fees.maxFeePerGas !== null);
  // Native gas funding/impersonation is confined to this disposable local fork.
  await local.send('anvil_impersonateAccount', [wallet]);
  await local.send('anvil_setBalance', [wallet, toBeHex(parseEther('100'))]);
  const signer = await local.getSigner(wallet);
  const steps = [];
  for (const step of plan.steps) {
    assert.equal(keccak256(step.transaction.data), step.calldataHash);
    assert.equal(step.transaction.from, wallet);
    assert.equal(step.transaction.value, '0x0');
    assert.equal(await local.getCode(step.creates), '0x');
    const transaction = { ...step.transaction, chainId: 31337 };
    const estimatedGas = await local.estimateGas(transaction);
    const gasLimit = (estimatedGas * 120n + 99n) / 100n;
    const receipt = await (await signer.sendTransaction({ ...transaction, gasLimit })).wait();
    assert.equal(receipt.status, 1);
    const code = await local.getCode(step.creates);
    assert.notEqual(code, '0x');
    steps.push({ name: step.name, nonce: step.nonce, predictedAddress: step.creates, calldataHash: step.calldataHash,
      localEstimatedGasRaw: String(estimatedGas), localGasUsedRaw: String(receipt.gasUsed),
      proposedGasLimitRaw: String(gasLimit), localRuntimeCodeHash: keccak256(code) });
  }
  const bind = (name, address) => new Contract(address, compiled[`src/${name}.sol`][name].abi, local);
  const factory = bind('StudioTokenFactory', plan.addresses.factory);
  const market = bind('StudioCurveMarket', plan.addresses.market);
  const lock = bind('StudioV4LiquidityLock', plan.addresses.lock);
  const hook = bind('StudioV4FeeHook', plan.addresses.hook);
  const vaultAddress = await factory.feeVault();
  const vault = bind('StudioFeeVault', vaultAddress);
  assert.equal((await factory.collection()).toLowerCase(), chain.collection.toLowerCase());
  assert.equal((await factory.quote()).toLowerCase(), chain.quote.toLowerCase());
  assert.equal(await factory.market(), plan.addresses.market);
  assert.equal(await factory.graduatedRecorder(), plan.addresses.hook);
  assert.equal(await vault.treasury(), wallet);
  assert.equal(await vault.registrar(), plan.addresses.factory);
  assert.equal(await market.factory(), plan.addresses.factory);
  assert.equal(await market.targetReserve(), BigInt(plan.economics.targetReserveRaw));
  assert.equal(await market.saleSupply(), BigInt(plan.economics.saleSupplyRaw));
  assert.equal(await market.openingPrice(), BigInt(plan.economics.openingPriceRaw));
  assert.equal(await market.priceIncrease(), BigInt(plan.economics.priceIncreaseRaw));
  assert.equal(await lock.market(), plan.addresses.market);
  assert.equal(await lock.hook(), plan.addresses.hook);
  assert.equal(await lock.lpFee(), BigInt(plan.economics.lpFeeUnits));
  assert.equal(await hook.factory(), plan.addresses.factory);
  assert.equal(await hook.liquidityLock(), plan.addresses.lock);
  assert.equal(await hook.creatorBps(), BigInt(plan.economics.creatorBps));
  assert.equal(await hook.studioBps(), BigInt(plan.economics.studioBps));
  assert.equal(await hook.platformBps(), BigInt(plan.economics.platformBps));
  assert.equal(await bind('StudioV4Quoter', plan.addresses.quoter).factory(), plan.addresses.factory);
  assert.equal(await upstream.getTransactionCount(wallet, 'pending'), plan.steps[0].nonce);
  assert.equal((await upstream.getBlock(block.number)).hash, block.hash);
  const sum = key => steps.reduce((total, step) => total + BigInt(step[key]), 0n);
  const estimatedGas = sum('localEstimatedGasRaw');
  const proposedGasLimit = sum('proposedGasLimitRaw');
  const estimatedCost = estimatedGas * fees.gasPrice;
  const conservativeCap = proposedGasLimit * fees.maxFeePerGas;
  const report = { mode: 'isolated-real-state-fork', mainnetWrites: false, executionEnabled: false,
    source: { chainId: 143, blockNumber: block.number, blockHash: block.hash, blockTime: new Date(block.timestamp * 1000).toISOString() },
    localChainId: 31337, localGasFundingOnly: true, deployer: wallet, treasury: wallet, collection: plan.collection,
    planHash: keccak256(Buffer.from(JSON.stringify(plan))), feeVaultPredictedAddress: vaultAddress, bindingsVerifiedLocally: true,
    observedMainnetBalanceRaw: String(actualBalance), observedMainnetBalanceMON: formatEther(actualBalance),
    observedGasPriceRaw: String(fees.gasPrice), observedMaxFeePerGasRaw: String(fees.maxFeePerGas),
    feeObservedAt: new Date().toISOString(), totalLocalEstimatedGasRaw: String(estimatedGas), totalLocalGasUsedRaw: String(sum('localGasUsedRaw')),
    proposedTotalGasLimitRaw: String(proposedGasLimit), estimatedCostMON: formatEther(estimatedCost), conservativeFeeCapMON: formatEther(conservativeCap),
    conservativeFundingShortfallMON: formatEther(actualBalance >= conservativeCap ? 0n : conservativeCap - actualBalance), steps,
    policy: 'Local rehearsal with actual public-wallet nonce and exact unsigned creation calldata. Gas used/estimates are fork evidence, not a Mainnet guarantee. Gas limits use a proposed 20% margin; cap uses the current RPC maxFeePerGas. No wallet signature, real funding, broadcast or deployed-address configuration. Recheck account/code/nonce/fees and each prior finalized deployment before signing.' };
  await writeFile(new URL('../artifacts/mainnet-deployment-rehearsal.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ deployer: wallet, sourceBlock: block.number, steps: steps.length, estimatedCostMON: report.estimatedCostMON,
    conservativeFeeCapMON: report.conservativeFeeCapMON, balanceMON: report.observedMainnetBalanceMON, conservativeFundingShortfallMON: report.conservativeFundingShortfallMON,
    bindingsVerifiedLocally: true, mainnetWrites: false }));
});
