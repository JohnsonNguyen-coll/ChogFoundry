import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import solc from 'solc';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const files = (await fs.readdir(path.join(root, 'src'))).filter(file => file.endsWith('.sol'));
const sources = Object.fromEntries(await Promise.all(files.map(async file => [`src/${file}`, { content: (await fs.readFile(path.join(root, 'src', file), 'utf8')).replace(/^\uFEFF/, '') }])));
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: {
  optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: 'shanghai',
  outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
} }), { import: file => {
  try {
    if (!file.startsWith('@openzeppelin/contracts/')) return { error: 'Import not allowed' };
    return { contents: require('node:fs').readFileSync(require.resolve(file), 'utf8') };
  } catch (error) { return { error: error.message }; }
} }));
for (const error of output.errors ?? []) console.error(error.formattedMessage);
if (output.errors?.some(error => error.severity === 'error')) process.exitCode = 1;
else {
  await fs.mkdir(path.join(root, 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/contracts.json'), JSON.stringify(output.contracts, null, 2));
  console.log(`Compiled ${files.length} source contracts with ${solc.version()}. No deployment.`);
}
