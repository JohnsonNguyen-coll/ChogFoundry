// Run locally by the human. Never invoke this script through an assistant after filling the key.
// Deliberately no automatic resume/retry: a partial or uncertain broadcast requires receipt review.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { Contract, JsonRpcProvider, Wallet, getAddress, keccak256, parseEther } from 'ethers';
import { prepareDeployment } from './mainnet-plan.mjs';
import { chain } from '../../backend/src/config.mjs';

const journalPath = new URL('../artifacts/mainnet-broadcast.json', import.meta.url);
class SafeDeploymentError extends Error {}
let provider;
let stage = 'configuration';
const check = (condition, message) => { if (!condition) throw message ? new SafeDeploymentError(message) : new Error('CHECK_FAILED'); };
const serialize = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? String(item) : item, 2) + '\n';
try {
  const checkOnly = process.argv.includes('--check-config');
  check(checkOnly || process.argv.includes('--broadcast'), 'Explicit --broadcast or --check-config is required.');
  check(chain.id === 143, 'Monad Mainnet chain143 is required.');
  const keyInput = process.env.PRIVATE_KEY?.trim();
  check(keyInput, 'PRIVATE_KEY is empty or missing in contracts/.env.');
  check(/^(0x)?[0-9a-fA-F]{64}$/.test(keyInput), 'PRIVATE_KEY must contain exactly 64 hexadecimal digits, optionally prefixed with 0x. Its value is never printed.');
  const budgetInput = process.env.DEPLOY_MAX_COST_MON?.trim();
  check(budgetInput, 'DEPLOY_MAX_COST_MON is empty or missing. Set your explicit maximum total gas budget in MON in contracts/.env.');
  // Refuse a second run even after success. Never overwrite pending/partial deployment evidence.
  let existing = false;
  try { await access(journalPath); existing = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  check(!existing, 'contracts/artifacts/mainnet-broadcast.json already exists. Review its receipts before continuing; do not delete or rerun blindly.');
  check(/^[0-9]+(?:\.[0-9]{1,18})?$/.test(budgetInput), 'DEPLOY_MAX_COST_MON must be a positive decimal MON amount, using a dot and at most 18 decimal places.');
  const budget = parseEther(budgetInput);
  check(budget > 0n, 'DEPLOY_MAX_COST_MON must be greater than zero.');
  let offlineWallet;
  try { offlineWallet = new Wallet(keyInput.startsWith('0x') ? keyInput : '0x' + keyInput); }
  catch { throw new SafeDeploymentError('PRIVATE_KEY is not a valid secp256k1 signing key. Its value is never printed.'); }
  delete process.env.PRIVATE_KEY;
  let deployer;
  try { deployer = getAddress(process.env.FOUNDRY_DEPLOYER_ADDRESS?.trim() || ''); }
  catch { throw new SafeDeploymentError('FOUNDRY_DEPLOYER_ADDRESS is missing or invalid. Enter the public deployment address.'); }
  check(offlineWallet.address === deployer, 'PRIVATE_KEY does not belong to FOUNDRY_DEPLOYER_ADDRESS. Check the key locally; do not send it in chat.');
  if (checkOnly) {
    console.log('Configuration valid. Signing key matches the public deployer and gas budget is set. No RPC, signing or broadcast was performed.');
    process.exit(0);
  }
  provider = new JsonRpcProvider(chain.rpcUrl, 143, { batchMaxCount: 1, cacheTimeout: -1 });
  const wallet = offlineWallet.connect(provider);
  stage = 'fresh unsigned plan';
  const plan = await prepareDeployment(provider, deployer);
  stage = 'rehearsal and full funding';
  const rehearsal = JSON.parse(await readFile(new URL('../artifacts/mainnet-deployment-rehearsal.json', import.meta.url), 'utf8'));
  check(rehearsal.deployer === deployer && rehearsal.mainnetWrites === false && rehearsal.bindingsVerifiedLocally === true);
  check(rehearsal.collection.address.toLowerCase() === chain.collection.toLowerCase());
  check(rehearsal.steps.length === plan.steps.length);
  for (const [index, step] of plan.steps.entries()) {
    const rehearsed = rehearsal.steps[index];
    check(rehearsed.nonce === step.nonce && rehearsed.calldataHash === step.calldataHash);
    check(rehearsed.predictedAddress === step.creates);
  }
  const initialFees = await provider.getFeeData();
  check(initialFees.maxFeePerGas !== null);
  const initialTotalCap = rehearsal.steps.reduce((sum, step) => sum + BigInt(step.proposedGasLimitRaw), 0n) * initialFees.maxFeePerGas;
  check(initialTotalCap <= budget, 'DEPLOY_MAX_COST_MON is below the current buffered total fee cap. No transaction submitted.');
  check(await provider.getBalance(deployer, 'latest') >= initialTotalCap, 'The deployer MON balance is below the current buffered total fee cap. No transaction submitted.');
  const compiled = JSON.parse(await readFile(new URL('../artifacts/contracts.json', import.meta.url), 'utf8'));
  const bind = (name, address) => new Contract(address, compiled[`src/${name}.sol`][name].abi, provider);
  const journal = { mode: 'human-invoked-mainnet-broadcast', chainId: 143, deployer, treasury: deployer,
    collection: plan.collection, maxCostRaw: String(budget), plan, steps: [], completed: false };
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  // Exclusive creation also protects against two CLI processes starting together.
  await writeFile(journalPath, serialize(journal), { flag: 'wx' });
  const save = () => writeFile(journalPath, serialize(journal));
  let spent = 0n;
  console.log(`Monad Mainnet | ${plan.collection.name} | deployer/treasury ${deployer}`);
  console.log(`Maximum total gas cost: ${process.env.DEPLOY_MAX_COST_MON} MON. Six ordered transactions; no raffle.`);
  for (const step of plan.steps) {
    stage = step.name;
    check(await provider.getCode(deployer, 'latest') === '0x');
    check(await provider.getTransactionCount(deployer, 'latest') === step.nonce);
    check(await provider.getTransactionCount(deployer, 'pending') === step.nonce);
    check(await provider.getCode(step.creates, 'latest') === '0x');
    check(keccak256(step.transaction.data) === step.calldataHash);
    check(BigInt(await provider.send('eth_chainId', [])) === 143n);
    const estimated = await provider.estimateGas(step.transaction);
    const gasLimit = (estimated * 120n + 99n) / 100n;
    const fees = await provider.getFeeData();
    check(fees.maxFeePerGas !== null && fees.maxPriorityFeePerGas !== null);
    const cap = gasLimit * fees.maxFeePerGas;
    check(spent + cap <= budget);
    check(await provider.getBalance(deployer, 'latest') >= cap);
    // Record intent before signing; ambiguous submission failures MUST NOT auto-resubmit.
    const row = { name: step.name, nonce: step.nonce, predictedAddress: step.creates,
      calldataHash: step.calldataHash, gasLimitRaw: String(gasLimit), maxFeePerGasRaw: String(fees.maxFeePerGas),
      status: 'broadcast-intent', transactionHash: null };
    journal.steps.push(row); await save();
    const transaction = await wallet.sendTransaction({ ...step.transaction, gasLimit,
      maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
    row.transactionHash = transaction.hash; row.status = 'pending'; await save();
    console.log(`${step.name}: ${transaction.hash}`);
    const end = Date.now() + 10 * 60 * 1000;
    let receipt;
    while (Date.now() < end) {
      const candidate = await provider.getTransactionReceipt(transaction.hash);
      if (candidate) {
        const canonical = await provider.getBlock(candidate.blockNumber);
        const head = await provider.getBlock('finalized');
        check(canonical?.hash === candidate.blockHash);
        check(candidate.status === 1);
        if (head && head.number >= candidate.blockNumber) { receipt = candidate; break; }
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    check(receipt);
    const observed = await provider.getTransaction(transaction.hash);
    check(observed?.from === deployer && observed.nonce === step.nonce && observed.chainId === 143n);
    check(observed.to?.toLowerCase() === step.transaction.to?.toLowerCase());
    check(observed.data === step.transaction.data && observed.value === 0n);
    if (!step.to) check(receipt.contractAddress === step.creates);
    const code = await provider.getCode(step.creates, receipt.blockNumber);
    check(code !== '0x');
    const at = { blockTag: receipt.blockNumber };
    if (step.name === 'hook-deployer') {
      check(await new Contract(step.creates, ['function deployer() view returns(address)'], provider).deployer(at) === deployer);
    }
    if (step.name === 'fee-hook') {
      const c = bind('StudioV4FeeHook', step.creates);
      check(await c.factory(at) === plan.addresses.factory && await c.liquidityLock(at) === plan.addresses.lock);
      check((await c.quote(at)).toLowerCase() === chain.quote.toLowerCase());
      check(await c.creatorBps(at) === BigInt(plan.economics.creatorBps));
      check(await c.studioBps(at) === BigInt(plan.economics.studioBps));
      check(await c.platformBps(at) === BigInt(plan.economics.platformBps));
    }
    if (step.name === 'liquidity-lock') {
      const c = bind('StudioV4LiquidityLock', step.creates);
      check(await c.market(at) === plan.addresses.market && await c.hook(at) === plan.addresses.hook);
      check(await c.lpFee(at) === BigInt(plan.economics.lpFeeUnits));
    }
    if (step.name === 'curve-market') {
      const c = bind('StudioCurveMarket', step.creates);
      check(await c.factory(at) === plan.addresses.factory && await c.graduationAdapter(at) === plan.addresses.lock);
      check((await c.collection(at)).toLowerCase() === chain.collection.toLowerCase());
      check(await c.targetReserve(at) === BigInt(plan.economics.targetReserveRaw));
      check(await c.saleSupply(at) === BigInt(plan.economics.saleSupplyRaw));
      check(await c.openingPrice(at) === BigInt(plan.economics.openingPriceRaw));
      check(await c.priceIncrease(at) === BigInt(plan.economics.priceIncreaseRaw));
    }
    if (step.name === 'token-factory') {
      const c = bind('StudioTokenFactory', step.creates);
      check((await c.collection(at)).toLowerCase() === chain.collection.toLowerCase());
      check((await c.quote(at)).toLowerCase() === chain.quote.toLowerCase());
      check(await c.market(at) === plan.addresses.market && await c.graduatedRecorder(at) === plan.addresses.hook);
      const vault = bind('StudioFeeVault', await c.feeVault(at));
      check(await vault.treasury(at) === deployer && await vault.registrar(at) === step.creates);
      journal.feeVault = await vault.getAddress(); journal.factoryDeploymentBlock = receipt.blockNumber;
    }
    if (step.name === 'v4-quoter') {
      const c = bind('StudioV4Quoter', step.creates);
      check(await c.factory(at) === plan.addresses.factory && await c.liquidityLock(at) === plan.addresses.lock);
    }
    check((await provider.getBlock(receipt.blockNumber))?.hash === receipt.blockHash);
    const actualCost = receipt.gasUsed * receipt.gasPrice;
    spent += actualCost;
    row.status = 'finalized-verified'; row.blockNumber = receipt.blockNumber; row.blockHash = receipt.blockHash;
    row.runtimeCodeHash = keccak256(code); row.actualCostRaw = String(actualCost);
    journal.actualTotalCostRaw = String(spent); await save();
  }
  journal.completed = true; await save();
  console.log('Six deployments finalized and bindings checked. Public receipts saved in contracts/artifacts/mainnet-broadcast.json. Runtime execution remains separately configured; source verification is still required.');
} catch (error) {
  // RPC/signing errors can contain sensitive transaction/provider details. Never print them.
  console.error(`Deployment stopped at ${stage}. ${error instanceof SafeDeploymentError ? error.message : 'Check configuration, gas budget and the public broadcast journal.'} Never rerun blindly after a partial or uncertain submission. No private key or provider error body is printed.`);
  process.exitCode = 1;
} finally { provider?.destroy(); }
