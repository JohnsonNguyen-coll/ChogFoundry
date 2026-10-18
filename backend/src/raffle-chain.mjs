import { Contract, Interface, ZeroHash, getAddress } from "ethers";
import { chain } from "./config.mjs";
import { AppError, address } from "./validation.mjs";
import { treasuryAddress } from "./treasury.mjs";
import { rulesHash, manifestDigest } from "./raffle-manifest.mjs";
export const entropyAddress = "0xd458261e832415cfd3bae5e416fdf3230ce6f134";
export const entropyProvider = "0x52DeaA1c84233F7bb8C8A45baeDE41091c616506";
const abi = [
  "function collection() view returns(address)",
  "function entropy() view returns(address)",
  "function provider() view returns(address)",
  "function organizer() view returns(address)",
  "function drawFee() view returns(uint128)",
  "function campaigns(bytes32) view returns(uint256 tokenId,uint64 closesAt,bytes32 rulesHash,bytes32 root,bytes32 manifestHash,uint32 entries,uint64 committedBlock,uint64 sequence,bytes32 randomness,bool exists,bool ready,bool claimed,bool cancelled)",
  "function winnerIndex(bytes32) view returns(uint256)",
  "function create(bytes32,uint256,uint64,bytes32)",
  "function commit(bytes32,bytes32,uint32,bytes32)",
  "function requestDraw(bytes32,bytes32)",
  "function claim(bytes32,uint256,address,bytes32[])",
  "function cancel(bytes32)",
];
const iface = new Interface(abi),
  same = (a, b) => a.toLowerCase() === b.toLowerCase();
export function raffleAddress() {
  if (!chain.raffleEscrowSupported)
    throw new AppError(503, 'COLLECTION_ESCROW_UNSUPPORTED', 'The Daks transfer validator rejected the raffle escrow path. Raffles remain unavailable for this collection; no transfer-policy bypass is provided.');
  if (!process.env.FOUNDRY_RAFFLE_ADDRESS)
    throw new AppError(
      503,
      "RAFFLE_NOT_DEPLOYED",
      "The reviewed raffle contract has not been configured. No campaign can open or draw.",
    );
  return address(process.env.FOUNDRY_RAFFLE_ADDRESS);
}
export async function raffleState(reader, campaign) {
  return reader.snapshot(async (block) => {
    const contract = raffleAddress(),
      at = { blockTag: block },
      c = new Contract(contract, abi, reader.provider);
    if (
      !same(await c.collection(at), chain.collection) ||
      !same(await c.entropy(at), entropyAddress) ||
      !same(await c.provider(at), entropyProvider) ||
      !same(await c.organizer(at), treasuryAddress())
    )
      throw new AppError(
        503,
        "RAFFLE_BINDING_MISMATCH",
        "Raffle asset, organizer or randomness bindings differ.",
      );
    const s = await c.campaigns(campaign.onchain_id, at);
    if (
      s.exists &&
      (s.rulesHash !== rulesHash(campaign) ||
        String(s.tokenId) !== campaign.prize_token_id ||
        Number(s.closesAt) !== Date.parse(campaign.ends_at) / 1000)
    )
      throw new AppError(
        503,
        "RAFFLE_RULES_MISMATCH",
        "Onchain prize, deadline or rules do not match this campaign.",
      );
    if (
      s.exists &&
      !s.claimed &&
      !s.cancelled &&
      !same(await reader.nft.ownerOf(s.tokenId, at), contract)
    )
      throw new AppError(
        503,
        "RAFFLE_PRIZE_MISSING",
        "The prize is not held in the raffle contract.",
      );
    if (
      campaign.manifest_json &&
      (manifestDigest(campaign.manifest_json) !==
        campaign.manifest_json.manifestHash ||
        (s.root !== ZeroHash &&
          (s.root !== campaign.manifest_json.root ||
            s.manifestHash !== campaign.manifest_json.manifestHash ||
            Number(s.entries) !== campaign.manifest_json.entries.length)))
    )
      throw new AppError(
        503,
        "RAFFLE_MANIFEST_MISMATCH",
        "The stored entry manifest does not match its canonical digest or the onchain commitment.",
      );
    const state = {
      contract,
      exists: s.exists,
      cancelled: s.cancelled,
      ready: s.ready,
      claimed: s.claimed,
      root: s.root,
      manifestHash: s.manifestHash,
      entries: Number(s.entries),
      sequence: String(s.sequence),
      randomness: s.ready ? s.randomness : null,
      winnerIndex: s.ready
        ? Number(await c.winnerIndex(campaign.onchain_id, at))
        : null,
      drawFeeRaw: String(await c.drawFee(at)),
      rulesHash: rulesHash(campaign),
      tokenId: campaign.prize_token_id,
    };
    return { state };
  }, "finalized");
}
export function raffleCalldata(campaign, state, action, wallet, seed) {
  const manifest = campaign.manifest_json;
  let data,
    value = "0x0",
    target = state.contract;
  if (action === "approve") {
    if (state.exists)
      throw new AppError(409, "RAFFLE_EXISTS", "Prize is already escrowed.");
    target = chain.collection;
    data = new Interface([
      "function approve(address,uint256)",
    ]).encodeFunctionData("approve", [state.contract, campaign.prize_token_id]);
  } else if (action === "create") {
    if (state.exists)
      throw new AppError(409, "RAFFLE_EXISTS", "Prize is already escrowed.");
    data = iface.encodeFunctionData("create", [
      campaign.onchain_id,
      campaign.prize_token_id,
      Math.floor(Date.parse(campaign.ends_at) / 1000),
      rulesHash(campaign),
    ]);
  } else if (action === "commit") {
    if (
      !manifest ||
      state.root !== ZeroHash ||
      !state.exists ||
      state.cancelled
    )
      throw new AppError(
        409,
        "MANIFEST_NOT_READY",
        "Freeze the entry list before committing.",
      );
    data = iface.encodeFunctionData("commit", [
      campaign.onchain_id,
      manifest.root,
      manifest.entries.length,
      manifest.manifestHash,
    ]);
  } else if (action === "draw") {
    if (
      !manifest ||
      state.root !== manifest.root ||
      state.manifestHash !== manifest.manifestHash ||
      state.sequence !== "0"
    )
      throw new AppError(
        409,
        "MANIFEST_NOT_COMMITTED",
        "The exact frozen manifest must be committed before drawing.",
      );
    if (!/^0x[0-9a-fA-F]{64}$/.test(seed ?? "") || seed === ZeroHash)
      throw new AppError(
        400,
        "SEED_REQUIRED",
        "Provide a nonzero cryptographic bytes32 contribution.",
      );
    data = iface.encodeFunctionData("requestDraw", [campaign.onchain_id, seed]);
    value = "0x" + BigInt(state.drawFeeRaw).toString(16);
  } else if (action === "claim") {
    if (
      !manifest ||
      !state.ready ||
      state.claimed ||
      state.root !== manifest.root ||
      state.manifestHash !== manifest.manifestHash
    )
      throw new AppError(
        409,
        "WINNER_UNAVAILABLE",
        "Canonical randomness and matching manifest are required.",
      );
    const entry = manifest.entries[state.winnerIndex];
    data = iface.encodeFunctionData("claim", [
      campaign.onchain_id,
      entry.index,
      entry.wallet,
      entry.proof,
    ]);
  } else if (action === "cancel") {
    data = iface.encodeFunctionData("cancel", [campaign.onchain_id]);
  } else
    throw new AppError(
      400,
      "INVALID_RAFFLE_ACTION",
      "Unsupported raffle action.",
    );
  return { chainId: 143, from: getAddress(wallet), to: target, data, value };
}
