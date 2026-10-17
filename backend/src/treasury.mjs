import { Contract, Interface, ZeroAddress, getAddress } from "ethers";
import { chain } from "./config.mjs";
import { AppError, address } from "./validation.mjs";
const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
const erc20 = new Interface([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const nftEvents = new Interface([
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
]);
const claims = new Interface([
  "event Claimed(address indexed beneficiary,uint256 creatorFee,uint256 studioFee,uint256 platformFee)",
]);
const fail = (message) => {
  throw new AppError(503, "TREASURY_EVIDENCE_UNAVAILABLE", message);
};
export function treasuryAddress() {
  if (!process.env.FOUNDRY_DEPLOYER_ADDRESS)
    throw new AppError(
      503,
      "TREASURY_NOT_CONFIGURED",
      "Configure the public deployer/treasury address.",
    );
  const a = address(process.env.FOUNDRY_DEPLOYER_ADDRESS);
  if (a === ZeroAddress) fail("Treasury must be nonzero.");
  return a;
}
async function vaultAt(reader, block) {
  const factoryAddress = process.env.FOUNDRY_FACTORY_ADDRESS;
  if (!factoryAddress) return null;
  const at = { blockTag: block },
    factory = new Contract(
      address(factoryAddress),
      [
        "function feeVault() view returns(address)",
        "function collection() view returns(address)",
        "function quote() view returns(address)",
      ],
      reader.provider,
    );
  if (
    !same(await factory.collection(at), chain.collection) ||
    !same(await factory.quote(at), chain.quote)
  )
    fail("Factory asset bindings differ.");
  const vaultAddress = await factory.feeVault(at),
    vault = new Contract(
      vaultAddress,
      [
        "function collection() view returns(address)",
        "function quote() view returns(address)",
        "function registrar() view returns(address)",
        "function treasury() view returns(address)",
        "function credits(address) view returns(uint256 creator,uint256 studio,uint256 platform)",
        "function liability() view returns(uint256)",
      ],
      reader.provider,
    );
  if (
    !same(await vault.collection(at), chain.collection) ||
    !same(await vault.quote(at), chain.quote) ||
    !same(await vault.registrar(at), factoryAddress) ||
    !same(await vault.treasury(at), treasuryAddress())
  )
    fail("Vault treasury bindings differ.");
  return vault;
}
export async function verifyTreasuryReceipt(reader, hash, kind, head) {
  const wallet = treasuryAddress(),
    p = reader.provider,
    receipt = await p.getTransactionReceipt(hash);
  if (!receipt || receipt.status !== 1 || receipt.blockNumber > head)
    fail("Receipt must be successful and finalized.");
  if ((await p.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash)
    fail("Receipt is no longer canonical.");
  const transfers = receipt.logs
    .filter((l) => same(l.address, chain.quote))
    .flatMap((l) => {
      try {
        return [erc20.parseLog(l).args];
      } catch {
        return [];
      }
    });
  const nfts = receipt.logs
    .filter((l) => same(l.address, chain.collection))
    .flatMap((l) => {
      try {
        const e = nftEvents.parseLog(l).args;
        return [{ from: e.from, to: e.to, tokenId: String(e.tokenId) }];
      } catch {
        return [];
      }
    });
  const base = {
    transactionHash: hash,
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    kind,
  };
  if (kind === "platform-claim") {
    const vault = await vaultAt(reader, receipt.blockNumber);
    if (!vault) fail("A verified factory/vault is required for fee evidence.");
    const events = receipt.logs
      .filter((l) => same(l.address, vault.target))
      .flatMap((l) => {
        try {
          return [claims.parseLog(l).args];
        } catch {
          return [];
        }
      })
      .filter((e) => same(e.beneficiary, wallet));
    if (events.length !== 1 || events[0].platformFee <= 0n)
      fail("No unique platform fee claim for this treasury.");
    const e = events[0],
      total = e.creatorFee + e.studioFee + e.platformFee;
    if (
      transfers.filter(
        (t) =>
          same(t.from, vault.target) && same(t.to, wallet) && t.value === total,
      ).length !== 1
    )
      fail("The claim payment is not funded by the bound vault.");
    return { ...base, platformRaw: String(e.platformFee), vault: vault.target };
  }
  if (!["buyback", "giveaway"].includes(kind))
    fail("Unsupported treasury receipt type.");
  const matching = nfts.filter((e) =>
    kind === "buyback"
      ? same(e.to, wallet) && e.from !== ZeroAddress
      : same(e.from, wallet) && !same(e.to, wallet) && e.to !== ZeroAddress,
  );
  if (!matching.length)
    fail("No matching NFT custody movement in this receipt.");
  const tx = await p.getTransaction(hash);
  let quoteSpent = 0n;
  if (kind === "buyback") {
    if (!same(tx?.from, wallet))
      fail(
        "Supported purchase evidence requires a direct treasury transaction.",
      );
    quoteSpent = transfers
      .filter((t) => same(t.from, wallet) && !same(t.to, wallet))
      .reduce((sum, t) => sum + t.value, 0n);
    if (quoteSpent === 0n && tx.value === 0n)
      fail(
        "No observable treasury payment; do not classify a gift as a purchase.",
      );
  }
  return {
    ...base,
    nfts: matching,
    quoteSpentRaw: String(quoteSpent),
    nativeSpentRaw: kind === "buyback" ? String(tx.value) : "0",
    fundingPolicy:
      "Observed payment and custody movement; marketplace total and funding source are not independently certified.",
  };
}
export async function readTreasury(reader, store) {
  const receipts = await store.receipts(),
    policy = await store.policy();
  if (receipts.length > 200)
    fail(
      "Treasury receipt capacity reached. Complete indexed accounting is required.",
    );
  return reader.snapshot(async (block) => {
    await reader.assertContracts(block);
    const wallet = treasuryAddress(),
      at = { blockTag: block };
    const [balance, native, ids] = await Promise.all([
      reader.quote.balanceOf(wallet, at),
      reader.provider.getBalance(wallet, block),
      reader.nft.tokensOfOwner(wallet, at),
    ]);
    if (ids.length > 200)
      fail("Treasury inventory exceeds the verification limit.");
    for (const id of ids)
      if (!same(await reader.nft.ownerOf(id, at), wallet))
        fail("NFT inventory changed or is inconsistent.");
    const verified = [],
      invalid = [];
    let platform = 0n,
      spent = 0n;
    for (const row of receipts) {
      const evidence = row.evidence_json;
      if (
        (await reader.provider.getBlock(evidence.blockNumber))?.hash !==
        evidence.blockHash
      ) {
        invalid.push(row.transaction_hash);
        continue;
      }
      // Recheck every attached receipt rather than trusting persisted attribution after a reorg.
      const current = await verifyTreasuryReceipt(
        reader,
        row.transaction_hash,
        row.kind,
        block,
      );
      verified.push(current);
      if (current.kind === "platform-claim")
        platform += BigInt(current.platformRaw);
      if (current.kind === "buyback") spent += BigInt(current.quoteSpentRaw);
    }
    const remaining = platform > spent ? platform - spent : 0n,
      available = remaining < balance ? remaining : balance;
    const vault = await vaultAt(reader, block);
    const credit = vault ? await vault.credits(wallet, at) : null;
    const allocated = policy
      ? BigInt(policy.operating_raw) + BigInt(policy.buyback_raw)
      : null;
    return {
      wallet,
      quoteAsset: chain.quote,
      balanceRaw: String(balance),
      nativeBalanceRaw: String(native),
      inventory: ids.map(String),
      pendingPlatformRaw: credit ? String(credit.platform) : null,
      verifiedRecordedPlatformRaw: String(platform),
      recordedBuybackQuoteRaw: String(spent),
      budgetCeilingRaw: String(available),
      policy,
      policyWithinVerifiedFunds:
        allocated === null ? null : allocated <= available,
      receipts: verified,
      orphanedReceipts: invalid,
      scope:
        "Attached canonical receipts only, not complete wallet history. Pending vault credit is not collected revenue. Native-asset purchases are disclosed separately and cannot be converted into CHOG budgets without evidence. No automatic buyback.",
      executionEnabled: false,
    };
  }, "finalized");
}
