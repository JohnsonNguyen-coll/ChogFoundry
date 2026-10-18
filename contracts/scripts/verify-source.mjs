// Public source verification only. Does not load .env files, private keys or sign transactions.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Interface, AbiCoder, JsonRpcProvider, keccak256 } from 'ethers';
import solc from 'solc';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const directory = new URL('../artifacts/verification/', import.meta.url);
const journal = JSON.parse(await readFile(new URL('../artifacts/mainnet-broadcast.json', import.meta.url), 'utf8'));
const deployedArtifacts = JSON.parse(await readFile(new URL('../artifacts/contracts.json', import.meta.url), 'utf8'));
assert.equal(journal.completed, true);
assert.equal(journal.chainId, 143);
const sources = {};
for (const file of Object.keys(deployedArtifacts)) {
  const path = file.startsWith('src/') ? new URL('../' + file, import.meta.url) : require.resolve(file);
  assert.ok(file.startsWith('src/') || file.startsWith('@openzeppelin/contracts/'));
  sources[file] = { content: (await readFile(path, 'utf8')).replace(/^\uFEFF/, '') };
}
const input = { language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'shanghai',
  outputSelection: { '*': { '*': ['abi', 'metadata', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences'] } } } };
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: file => {
  if (!file.startsWith('@openzeppelin/contracts/')) return { error: 'Import not allowed' };
  try {
    const content = require('node:fs').readFileSync(require.resolve(file), 'utf8');
    input.sources[file] = { content };
    return { contents: content };
  } catch { return { error: 'Dependency source unavailable' }; }
} }));
assert.ok(!output.errors?.some(e => e.severity === 'error'), 'Source compilation failed');
for (const [file, contracts] of Object.entries(deployedArtifacts)) for (const [name, artifact] of Object.entries(contracts)) {
  assert.equal(output.contracts[file][name].evm.bytecode.object, artifact.evm.bytecode.object, `Creation bytecode changed: ${file}:${name}`);
}
await mkdir(directory, { recursive: true });
await writeFile(new URL('standard-input.json', directory), JSON.stringify(input));
const mapping = { 'hook-deployer': ['StudioV4FeeHook', 'StudioHookDeployer'], 'fee-hook': ['StudioV4FeeHook', 'StudioV4FeeHook'],
  'liquidity-lock': ['StudioV4LiquidityLock', 'StudioV4LiquidityLock'], 'curve-market': ['StudioCurveMarket', 'StudioCurveMarket'],
  'token-factory': ['StudioTokenFactory', 'StudioTokenFactory'], 'v4-quoter': ['StudioV4Quoter', 'StudioV4Quoter'] };
const targets = journal.steps.map(step => {
  const [file, name] = mapping[step.name];
  const creation = step.name === 'fee-hook'
    ? new Interface(deployedArtifacts['src/StudioV4FeeHook.sol'].StudioHookDeployer.abi).decodeFunctionData('deploy', journal.plan.steps.find(s => s.name === step.name).data)[1]
    : journal.plan.steps.find(s => s.name === step.name).data;
  const bytecode = output.contracts[`src/${file}.sol`][name].evm.bytecode.object;
  assert.ok(creation.startsWith('0x' + bytecode));
  return { name, identifier: `src/${file}.sol:${name}`, address: step.predictedAddress, transactionHash: step.transactionHash,
    constructorArguments: creation.slice(2 + bytecode.length) };
});
targets.push({ name: 'StudioFeeVault', identifier: 'src/StudioFeeVault.sol:StudioFeeVault', address: journal.feeVault,
  transactionHash: journal.steps.find(s => s.name === 'token-factory').transactionHash,
  constructorArguments: AbiCoder.defaultAbiCoder().encode(['address', 'address', 'address', 'address'], [journal.collection.address, journal.plan.quote, journal.plan.addresses.factory, journal.treasury]).slice(2) });
const provider = new JsonRpcProvider('https://rpc.monad.xyz', undefined, { batchMaxCount: 1, cacheTimeout: -1 });
try {
  assert.equal((await provider.getNetwork()).chainId, 143n);
  const head = await provider.getBlock('finalized');
  for (const target of targets) {
    const receipt = await provider.getTransactionReceipt(target.transactionHash);
    assert.equal(receipt.status, 1); assert.ok(receipt.blockNumber <= head.number);
    assert.equal((await provider.getBlock(receipt.blockNumber)).hash, receipt.blockHash);
    const [file, name] = target.identifier.split(':');
    const artifact = output.contracts[file][name];
    const code = (await provider.getCode(target.address, head.number)).slice(2);
    let normalized = code;
    for (const entries of Object.values(artifact.evm.deployedBytecode.immutableReferences)) for (const { start, length } of entries)
      normalized = normalized.slice(0, start * 2) + '0'.repeat(length * 2) + normalized.slice((start + length) * 2);
    assert.equal(normalized, artifact.evm.deployedBytecode.object, `Runtime mismatch: ${name}`);
    target.runtimeCodeHash = keccak256('0x' + code);
    await writeFile(new URL(target.name + '-constructor.txt', directory), target.constructorArguments + '\n');
  }
  assert.equal((await provider.getBlock(head.number)).hash, head.hash, 'Verification snapshot changed');
  const result = { compilerVersion: solc.version().split('.Emscripten')[0], chainId: 143, sourceBlock: head.number, sourceHash: head.hash,
    localSourceAndRuntimeMatch: true, targets };
  await writeFile(new URL('manifest.json', directory), JSON.stringify(result, null, 2));
  console.log('All seven local compiled runtimes match Mainnet (immutable slots excluded; actual bindings separately verified).');
  if (process.argv.includes('--submit')) {
    for (const target of targets) {
      const response = await fetch(`https://sourcify.dev/server/v2/verify/143/${target.address}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stdJsonInput: input, compilerVersion: result.compilerVersion, contractIdentifier: target.identifier, creationTransactionHash: target.transactionHash }),
        signal: AbortSignal.timeout(60000) });
      target.submission = { status: response.status, result: await response.json() };
      await writeFile(new URL('manifest.json', directory), JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ name: target.name, ...target.submission }));
    }
  }
} finally { provider.destroy(); }
