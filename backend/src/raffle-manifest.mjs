import { AbiCoder, keccak256, toUtf8Bytes, concat, getAddress } from "ethers";
import { AppError } from "./validation.mjs";
const abi = AbiCoder.defaultAbiCoder();
// PostgreSQL JSONB reorders object keys. Hash canonical JSON, never insertion order.
export function canonicalJson(value) {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function manifestDigest(manifest) {
  const { manifestHash, ...content } = manifest;
  return keccak256(toUtf8Bytes(canonicalJson(content)));
}

export function rulesHash(campaign) {
  return keccak256(
    toUtf8Bytes(
      JSON.stringify({
        version: 1,
        title: campaign.title,
        rules: campaign.rules,
        prizeTokenId: campaign.prize_token_id,
        entryPoints: campaign.entry_points,
        maxEntries: campaign.max_entries,
        startsAt: new Date(campaign.starts_at).toISOString(),
        endsAt: new Date(campaign.ends_at).toISOString(),
        target: "https://x.com/ChogNFT",
        eligibility: "verified-free-X-engagement",
        prizes: 1,
      }),
    ),
  );
}
export function entryLeaf(chainId, contract, id, index, wallet) {
  return keccak256(
    keccak256(
      abi.encode(
        ["uint256", "address", "bytes32", "uint256", "address"],
        [chainId, contract, id, index, wallet],
      ),
    ),
  );
}
const pair = (a, b) =>
  keccak256(concat(BigInt(a) < BigInt(b) ? [a, b] : [b, a]));
export function buildManifest(campaign, entries, contract, chainId = 143) {
  contract = getAddress(contract);
  if (!entries.length || entries.length > 5000)
    throw new AppError(
      409,
      "INVALID_ENTRY_COUNT",
      "The committed list must contain 1 to 5000 wallets.",
    );
  const sorted = [...entries].sort((a, b) =>
    BigInt(a.wallet) < BigInt(b.wallet)
      ? -1
      : BigInt(a.wallet) > BigInt(b.wallet)
        ? 1
        : 0,
  );
  if (new Set(sorted.map((e) => e.wallet.toLowerCase())).size !== sorted.length)
    throw new AppError(
      409,
      "DUPLICATE_ENTRIES",
      "Duplicate wallets cannot enter the manifest.",
    );
  const wallets = sorted.map((e, index) => ({
    index,
    wallet: getAddress(e.wallet),
    pointsSpent: e.points_spent,
  }));
  const levels = [
    wallets.map((e) =>
      entryLeaf(chainId, contract, campaign.onchain_id, e.index, e.wallet),
    ),
  ];
  while (levels.at(-1).length > 1) {
    const p = levels.at(-1),
      next = [];
    for (let i = 0; i < p.length; i += 2)
      next.push(i + 1 < p.length ? pair(p[i], p[i + 1]) : p[i]);
    levels.push(next);
  }
  const manifest = {
    version: 1,
    chainId,
    contract,
    campaignId: campaign.id,
    onchainId: campaign.onchain_id,
    rulesHash: rulesHash(campaign),
    root: levels.at(-1)[0],
    entries: wallets.map((e) => {
      let i = e.index;
      const proof = [];
      for (const level of levels.slice(0, -1)) {
        const sibling = i ^ 1;
        if (sibling < level.length) proof.push(level[sibling]);
        i = Math.floor(i / 2);
      }
      return { ...e, proof };
    }),
  };
  return {
    ...manifest,
    manifestHash: manifestDigest(manifest),
  };
}
export function verifyEntry(manifest, entry) {
  let node = entryLeaf(
    manifest.chainId,
    manifest.contract,
    manifest.onchainId,
    entry.index,
    entry.wallet,
  );
  for (const sibling of entry.proof) node = pair(node, sibling);
  return node === manifest.root;
}
