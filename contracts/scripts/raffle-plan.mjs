import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  getAddress,
  getCreateAddress,
  keccak256,
  ZeroAddress,
} from "ethers";
import { chain } from "../../backend/src/config.mjs";
import {
  entropyAddress,
  entropyProvider,
} from "../../backend/src/raffle-chain.mjs";
export async function prepareRaffleDeployment(
  provider,
  deployer,
  { localFork = false } = {},
) {
  if (!localFork && !chain.raffleEscrowSupported)
    throw new Error('The selected collection rejects the current raffle escrow path. No Mainnet raffle deployment plan is available.');
  deployer = getAddress(deployer);
  if (deployer === ZeroAddress)
    throw new Error("A public deployer is required.");
  const chainId = Number(BigInt(await provider.send("eth_chainId", [])));
  if (localFork) {
    const url = new URL(provider._getConnection().url);
    if (
      chainId !== 31337 ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      !(await provider.send("anvil_metadata", [])).forkedNetwork
    )
      throw new Error("A guarded real-state loopback fork is required.");
  } else if (chainId !== 143) throw new Error("Monad Mainnet is required.");
  const block = await provider.getBlock(localFork ? "latest" : "finalized");
  if (!block?.hash) throw new Error("Canonical source unavailable.");
  for (const target of [chain.collection, entropyAddress])
    if ((await provider.getCode(target, block.number)) === "0x")
      throw new Error("Required real infrastructure is missing.");
  if ((await provider.getCode(deployer, "latest")) !== "0x")
    throw new Error("A direct EOA deployer is required.");
  const oracle = new Contract(
    entropyAddress,
    [
      "function getDefaultProvider() view returns(address)",
      "function getFeeV2(address,uint32) view returns(uint128)",
    ],
    provider,
  );
  if (
    (
      await oracle.getDefaultProvider({ blockTag: block.number })
    ).toLowerCase() !== entropyProvider.toLowerCase()
  )
    throw new Error("Review the changed Entropy provider before deployment.");
  const nonce = await provider.getTransactionCount(deployer, "latest");
  if (nonce !== (await provider.getTransactionCount(deployer, "pending")))
    throw new Error("Resolve pending deployer transactions first.");
  const creates = getCreateAddress({ from: deployer, nonce });
  if ((await provider.getCode(creates, "latest")) !== "0x")
    throw new Error("Predicted deployment address is occupied.");
  const artifacts = JSON.parse(
      await readFile(
        new URL("../artifacts/contracts.json", import.meta.url),
        "utf8",
      ),
    ),
    artifact = artifacts["src/FoundryRaffle.sol"].FoundryRaffle;
  const data = (
    await new ContractFactory(
      artifact.abi,
      artifact.evm.bytecode.object,
    ).getDeployTransaction(
      chain.collection,
      entropyAddress,
      entropyProvider,
      deployer,
    )
  ).data;
  const observedDrawFeeRaw = String(
    await oracle.getFeeV2(entropyProvider, 100000, { blockTag: block.number }),
  );
  if (
    (await provider.getBlock(block.number))?.hash !== block.hash ||
    nonce !== (await provider.getTransactionCount(deployer, "pending"))
  )
    throw new Error("Source or deployer nonce changed. Rebuild the plan.");
  return {
    chainId,
    deployer,
    organizer: deployer,
    collection: chain.collection,
    entropy: entropyAddress,
    provider: entropyProvider,
    creates,
    nonce,
    calldataHash: keccak256(data),
    transaction: { chainId, from: deployer, nonce, data, value: "0x0" },
    source: {
      blockNumber: block.number,
      blockHash: block.hash,
      blockTime: new Date(block.timestamp * 1000).toISOString(),
    },
    observedDrawFeeRaw,
    executionEnabled: false,
    policy:
      "Unsigned creation plan only. Predicted address is not a deployed contract and must not be used as runtime configuration. Rebuild after nonce changes. No campaign is opened, NFT transferred, fee paid or transaction broadcast.",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const provider = new JsonRpcProvider(chain.rpcUrl, undefined, {
    batchMaxCount: 1,
    cacheTimeout: -1,
  });
  try {
    if (!process.env.FOUNDRY_DEPLOYER_ADDRESS)
      throw new Error("Missing public deployer.");
    const plan = await prepareRaffleDeployment(
      provider,
      process.env.FOUNDRY_DEPLOYER_ADDRESS,
    );
    await mkdir(new URL("../artifacts/", import.meta.url), { recursive: true });
    await writeFile(
      new URL("../artifacts/raffle-deployment-plan.json", import.meta.url),
      JSON.stringify(plan, null, 2),
    );
    console.log(
      "Saved unsigned contracts/artifacts/raffle-deployment-plan.json. No transaction submitted.",
    );
  } catch {
    console.error(
      "Raffle deployment plan unavailable. Check public deployer, RPC, compiled source and pending nonce. No key or transaction is used.",
    );
    process.exitCode = 1;
  } finally {
    provider.destroy();
  }
}
