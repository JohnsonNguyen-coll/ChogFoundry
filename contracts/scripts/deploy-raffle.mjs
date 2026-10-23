// Human-invoked CLI only. Never load the user's signing environment through agent tools.
// A partial/uncertain broadcast is never retried automatically.
import { access, mkdir, writeFile } from 'node:fs/promises';
import { Contract, JsonRpcProvider, Wallet, getAddress, keccak256, parseEther, formatEther } from 'ethers';
import { chain } from '../../backend/src/config.mjs';
import { prepareRaffleDeployment } from './raffle-plan.mjs';

const journalPath = new URL('../artifacts/raffle-broadcast.json', import.meta.url);
class DeploymentError extends Error {}
const check = (condition, message) => { if (!condition) throw new DeploymentError(message || 'Deployment verification failed.'); };
const serialize = value => JSON.stringify(value, null, 2) + '\n';
let provider, stage = 'configuration';
try {
  const checkOnly = process.argv.includes('--check-config');
  check(checkOnly || process.argv.includes('--broadcast'), 'Explicit --broadcast or --check-config is required.');
  check(chain.id === 143 && chain.collectionKey === 'chog-genesis', 'Select FOUNDRY_COLLECTION=chog-genesis for this deployment.');
  const key = process.env.PRIVATE_KEY?.trim();
  check(key, 'PRIVATE_KEY is empty or missing in contracts/.env.');
  check(/^(0x)?[0-9a-fA-F]{64}$/.test(key), 'PRIVATE_KEY must contain 64 hexadecimal digits, optionally prefixed with 0x.');
  const budgetInput = process.env.DEPLOY_MAX_COST_MON?.trim();
  check(budgetInput && /^[0-9]+(?:\.[0-9]{1,18})?$/.test(budgetInput), 'Set DEPLOY_MAX_COST_MON to your positive decimal MON gas budget.');
  const budget = parseEther(budgetInput);
  check(budget > 0n, 'DEPLOY_MAX_COST_MON must be greater than zero.');
  let offlineWallet, deployer;
  try { offlineWallet = new Wallet(key.startsWith('0x') ? key : '0x' + key); }
  catch { throw new DeploymentError('PRIVATE_KEY is not a valid signing key.'); }
  delete process.env.PRIVATE_KEY;
  try { deployer = getAddress(process.env.FOUNDRY_DEPLOYER_ADDRESS?.trim() || ''); }
  catch { throw new DeploymentError('Set FOUNDRY_DEPLOYER_ADDRESS to the public deployment wallet.'); }
  check(offlineWallet.address === deployer, 'PRIVATE_KEY does not belong to FOUNDRY_DEPLOYER_ADDRESS.');
  if (checkOnly) {
    console.log('Raffle configuration valid for Chog Genesis. No RPC, signing or broadcast was performed.');
  } else {
    let existing = false;
    try { await access(journalPath); existing = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    check(!existing, 'raffle-broadcast.json already exists. Review its transaction before continuing; do not delete or rerun blindly.');
    provider = new JsonRpcProvider(chain.rpcUrl, 143, { batchMaxCount: 1, cacheTimeout: -1 });
    stage = 'fresh plan and simulation';
    const plan = await prepareRaffleDeployment(provider, deployer);
    check(keccak256(plan.transaction.data) === plan.calldataHash);
    const estimate = await provider.estimateGas(plan.transaction);
    const gasLimit = (estimate * 120n + 99n) / 100n;
    const fees = await provider.getFeeData();
    check(fees.maxFeePerGas !== null && fees.maxPriorityFeePerGas !== null, 'Current network gas fees are unavailable.');
    const cap = gasLimit * fees.maxFeePerGas;
    check(cap <= budget, `Gas fee cap ${formatEther(cap)} MON exceeds DEPLOY_MAX_COST_MON. No transaction submitted.`);
    check(await provider.getBalance(deployer, 'latest') >= cap, `Wallet needs at least ${formatEther(cap)} MON for the gas fee cap.`);
    check(await provider.getTransactionCount(deployer, 'latest') === plan.nonce && await provider.getTransactionCount(deployer, 'pending') === plan.nonce, 'Wallet nonce changed. Rebuild the plan.');
    check(await provider.getCode(plan.creates, 'latest') === '0x', 'Predicted contract address is occupied.');
    check((await provider.getBlock(plan.source.blockNumber))?.hash === plan.source.blockHash, 'Planning block changed. Rebuild the plan.');
    check(BigInt(await provider.send('eth_chainId', [])) === 143n);
    const journal = { collection: plan.collection, organizer: deployer, plan, gasLimitRaw: String(gasLimit), feeCapMON: formatEther(cap),
      maxCostMON: budgetInput, status: 'broadcast-intent', transactionHash: null, completed: false };
    await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
    await writeFile(journalPath, serialize(journal), { flag: 'wx' });
    const save = () => writeFile(journalPath, serialize(journal));
    console.log(`Monad Mainnet | Chog Genesis raffle | organizer ${deployer} | maximum fee ${formatEther(cap)} MON`);
    stage = 'broadcast';
    const transaction = await offlineWallet.connect(provider).sendTransaction({ ...plan.transaction, gasLimit,
      maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas });
    journal.transactionHash = transaction.hash; journal.status = 'pending'; await save();
    console.log(`FoundryRaffle: ${transaction.hash}`);
    stage = 'finalized receipt verification';
    const deadline = Date.now() + 10 * 60 * 1000;
    let receipt;
    while (Date.now() < deadline) {
      const candidate = await provider.getTransactionReceipt(transaction.hash);
      if (candidate) {
        check(candidate.status === 1, 'Raffle deployment reverted. Inspect the saved transaction.');
        check((await provider.getBlock(candidate.blockNumber))?.hash === candidate.blockHash, 'Receipt block changed. Inspect the saved transaction.');
        const head = await provider.getBlock('finalized');
        if (head && head.number >= candidate.blockNumber) { receipt = candidate; break; }
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    check(receipt, 'Confirmation timed out. Inspect the saved transaction before taking further action.');
    const observed = await provider.getTransaction(transaction.hash);
    check(observed?.from === deployer && observed.nonce === plan.nonce && observed.chainId === 143n && observed.to === null);
    check(observed.data === plan.transaction.data && observed.value === 0n && receipt.contractAddress === plan.creates);
    const code = await provider.getCode(plan.creates, receipt.blockNumber);
    check(code !== '0x');
    const raffle = new Contract(plan.creates, ['function collection() view returns(address)', 'function entropy() view returns(address)',
      'function provider() view returns(address)', 'function organizer() view returns(address)'], provider);
    const at = { blockTag: receipt.blockNumber };
    const [collection, entropy, source, organizer] = await Promise.all([raffle.collection(at), raffle.entropy(at), raffle.provider(at), raffle.organizer(at)]);
    check(collection.toLowerCase() === chain.collection.toLowerCase() && entropy.toLowerCase() === plan.entropy.toLowerCase());
    check(source.toLowerCase() === plan.provider.toLowerCase() && organizer === deployer);
    check((await provider.getBlock(receipt.blockNumber))?.hash === receipt.blockHash);
    Object.assign(journal, { completed: true, status: 'finalized-verified', address: plan.creates, blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash, runtimeCodeHash: keccak256(code), actualCostMON: formatEther(receipt.gasUsed * receipt.gasPrice) });
    await save();
    console.log(`Raffle deployed and bindings verified. FOUNDRY_RAFFLE_ADDRESS=${plan.creates}`);
    console.log('Public receipt: contracts/artifacts/raffle-broadcast.json. No campaign opened or NFT transferred.');
  }
} catch (error) {
  console.error(`Raffle deployment stopped at ${stage}. ${error instanceof DeploymentError ? error.message : 'Check configuration and the public raffle broadcast journal.'} Never rerun blindly after an uncertain submission.`);
  process.exitCode = 1;
} finally { provider?.destroy(); }
