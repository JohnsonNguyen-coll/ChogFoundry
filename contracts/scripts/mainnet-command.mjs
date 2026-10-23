// Human-invoked deployment entry point. Preparation children never receive the signing key.
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function mainnetSteps(environment, { prepareOnly = false } = {}) {
  const signing = { ...environment, FOUNDRY_COLLECTION: 'chog-genesis' };
  const preparation = { ...signing };
  delete preparation.PRIVATE_KEY;
  return [
    { name: 'fresh Chog Genesis plan', script: 'mainnet-plan.mjs', args: [], env: preparation },
    { name: 'Chog Genesis fork rehearsal', script: 'mainnet-rehearsal.mjs', args: [], env: preparation },
    ...(!prepareOnly ? [{ name: 'Mainnet deployment', script: 'deploy-mainnet.mjs', args: ['--broadcast'], env: signing }] : []),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let stage = 'configuration';
  try {
    const prepareOnly = process.argv.includes('--prepare-only');
    if (!prepareOnly && !process.argv.includes('--broadcast')) throw Error('Explicit --broadcast or --prepare-only is required.');
    let existing = false;
    try { await access(new URL('../artifacts/mainnet-broadcast.json', import.meta.url)); existing = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (existing) throw Error('mainnet-broadcast.json already exists. Review its receipts; do not delete or rerun blindly.');
    for (const step of mainnetSteps(process.env, { prepareOnly })) {
      stage = step.name;
      console.log(`Starting ${stage}…`);
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(new URL(step.script, import.meta.url)), ...step.args],
          { env: step.env, windowsHide: true, stdio: 'inherit' });
        child.once('error', () => reject(Error('Unable to start deployment step.')));
        child.once('exit', code => code === 0 ? resolve() : reject(Error('Deployment step failed. No later step was run.')));
      });
    }
  } catch (error) {
    console.error(`Command stopped at ${stage}. ${error.message}`);
    process.exitCode = 1;
  }
}
