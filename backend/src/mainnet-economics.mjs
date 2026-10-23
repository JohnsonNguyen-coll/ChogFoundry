// User-approved immutable economics, 2026-10-16. No signer, deployment or automatic execution.
export const mainnetEconomics=Object.freeze({
  chainId:143,
  supplyRaw:1000000000n*10n**18n,
  creatorAllocationRaw:0n,
  saleSupplyRaw:625000000n*10n**18n,
  graduationInventoryRaw:375000000n*10n**18n,
  openingPriceRaw:800000000000000n,
  priceIncreaseRaw:3200000000000000n,
  targetReserveRaw:1500000n*10n**18n,
  creatorBps:30,studioBps:30,platformBps:40,lpFeeUnits:3000,
  venue:'uniswap-v4',lpCustody:'permanent-full-range-lock',
  treasuryPolicy:'same-as-deployer'
});
