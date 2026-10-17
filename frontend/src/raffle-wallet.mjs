const same = (a, b) => a?.toLowerCase() === b?.toLowerCase();
export function reviewedRaffle(body, wallet, chainId = 143) {
  const tx = body.transaction,
    action = body.action,
    source = body.provenance;
  if (
    body.status !== "simulated" ||
    !["approve", "create", "commit", "draw", "claim", "cancel"].includes(
      action,
    ) ||
    !/^0x[0-9a-fA-F]{40}$/.test(wallet || "") ||
    !tx ||
    !same(tx.from, wallet) ||
    BigInt(tx.chainId) !== BigInt(chainId)
  )
    throw new Error("Raffle action or signing wallet differs from the review.");
  if (
    !source?.blockHash ||
    !Number.isSafeInteger(source.blockNumber) ||
    source.chainId !== chainId ||
    (chainId === 143 && source.finality !== "finalized")
  )
    throw new Error("Canonical finalized raffle source is required.");
  if (
    !/^0x[0-9a-fA-F]{40}$/.test(body.state?.contract || "") ||
    !same(
      tx.to,
      action === "approve" ? body.collection : body.state.contract,
    ) ||
    !/^0x(?:[0-9a-fA-F]{2}){4,}$/.test(tx.data) ||
    !body.gasEstimateRaw ||
    BigInt(body.gasEstimateRaw) <= 0n
  )
    throw new Error("Raffle calldata has not been simulated.");
  const value = BigInt(tx.value);
  if (
    value < 0n ||
    value >= 1n << 256n ||
    (action === "draw" ? value !== BigInt(body.state.drawFeeRaw) : value !== 0n)
  )
    throw new Error(
      "Only the reviewed draw may pay the exact native randomness fee.",
    );
  return {
    transaction: { ...tx, chainId: String(chainId) },
    snapshot: { blockNumber: source.blockNumber, blockHash: source.blockHash },
    deadline: null,
    fingerprint: JSON.stringify([
      body.campaignId,
      action,
      tx.from.toLowerCase(),
      tx.to.toLowerCase(),
      tx.data.toLowerCase(),
      String(value),
      body.state.rulesHash,
      body.state.root,
      body.state.manifestHash,
      body.state.sequence,
    ]),
  };
}
