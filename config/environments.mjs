// No public-network runner is provided. Source evidence is not deployment approval.
export const local = Object.freeze({ chainId: 1337, mode: 'in-memory', assets: 'mocks', deployPublicNetwork: false });
export const officialEvidence = Object.freeze({
  checkedOn: '2026-10-09',
  quote: Object.freeze({
    publishedAddress: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777',
    source: 'https://www.chog.xyz/',
    status: 'published-on-official-site; runtime-chain-decimals-behavior-unverified',
    enabled: false
  }),
  collection: Object.freeze({ publishedAddress: null, status: 'unverified', enabled: false }),
  publicDeploymentEnabled: false
});
