import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
export const root = fileURLToPath(new URL('../', import.meta.url));
export async function compile() {
  const files = ['contracts/spikes/FeeLedgerSpike.sol', 'contracts/test/Mocks.sol'];
  const sources = Object.fromEntries(await Promise.all(files.map(async file => [file, { content: (await fs.readFile(path.join(root, file), 'utf8')).replace(/^\uFEFF/, '') }])));
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: {
    optimizer: { enabled: true, runs: 200 }, evmVersion: 'shanghai',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  } })));
  const errors = (output.errors ?? []).filter(item => item.severity === 'error');
  if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join('\n'));
  return output.contracts;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const contracts = await compile();
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/contracts.json'), JSON.stringify(contracts, null, 2));
  console.log(`Compiled local spikes with ${solc.version()} (Shanghai EVM); artifacts/contracts.json`);
}
