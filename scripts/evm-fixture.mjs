import ganache from 'ganache';
import { BrowserProvider, ContractFactory } from 'ethers';
import { compile } from './compile.mjs';
let compiled;
export async function evmFixture() {
  compiled ??= await compile();
  const rpc = ganache.provider({ logging: { quiet: true }, chain: { chainId: 1337, hardfork: 'shanghai' }, wallet: { totalAccounts: 6 } });
  const provider = new BrowserProvider(rpc); provider.pollingInterval = 10;
  const [a, b, recorder, treasury, stranger] = await Promise.all([0, 1, 2, 3, 4].map(i => provider.getSigner(i)));
  async function deploy(file, name, args = []) {
    const artifact = compiled[file][name];
    const contract = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, a).deploy(...args);
    await contract.waitForDeployment(); return contract;
  }
  const nft = await deploy('contracts/test/Mocks.sol', 'MockChog');
  const quote = await deploy('contracts/test/Mocks.sol', 'MockQuote');
  const ledger = await deploy('contracts/spikes/FeeLedgerSpike.sol', 'FeeLedgerSpike', [await nft.getAddress(), await quote.getAddress(), await recorder.getAddress(), await treasury.getAddress()]);
  const addresses = Object.fromEntries(await Promise.all(Object.entries({ a, b, recorder, treasury, stranger }).map(async ([key, signer]) => [key, await signer.getAddress()])));
  const send = async tx => (await tx).wait();
  await send(nft.mint(addresses.a, 7));
  await send(quote.mint(addresses.recorder, 1_000_000n));
  await send(quote.connect(recorder).approve(await ledger.getAddress(), 1_000_000n));
  return { rpc, provider, a, b, recorder, treasury, stranger, addresses, nft, quote, ledger, send,
    close: async () => { provider.destroy(); await rpc.disconnect(); } };
}
