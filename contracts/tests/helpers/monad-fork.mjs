import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { FetchRequest, JsonRpcProvider } from 'ethers';
import { chain } from '../../../backend/src/config.mjs';

const defaultAnvil = process.platform === 'win32'
  ? fileURLToPath(new URL('../../../artifacts/evm-tools/node_modules/@foundry-rs/anvil-win32-amd64/bin/anvil.exe', import.meta.url))
  : 'anvil';

// No external fork RPC URL is accepted. All mutation clients are child-owned loopback nodes.
export async function withMonadFork(action) {
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
    return await action({ local, upstream, block });
  } finally {
    local?.destroy(); upstream.destroy();
    if (child?.pid && child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}); }
  }
}
