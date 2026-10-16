// Provenance recorded in docs/SOURCES.md. Backend Mainnet access is READ ONLY; human-confirmed browser wallet execution is separate.
export const chain = Object.freeze({
  id: 143, name: 'Monad Mainnet', symbol: 'MON',
  rpcUrl: process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz',
  explorer: 'https://monadscan.com',
  documentation: 'https://docs.monad.xyz/developer-essentials/network-information',
  quote: '0x350035555E10d9AfAF1566AaebfCeD5BA6C27777',
  collection: '0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763',
  collectionSource: 'https://opensea.io/collection/chog-genesis',
  quoteSource: 'https://www.chog.xyz/'
});
export const erc20Abi = [
  'function name() view returns (string)', 'function symbol() view returns (string)',
  'function decimals() view returns (uint8)', 'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)'
];
export const nftAbi = [
  'function name() view returns (string)', 'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)', 'function supportsInterface(bytes4) view returns (bool)',
  'function ownerOf(uint256) view returns (address)', 'function tokenURI(uint256) view returns (string)',
  'function balanceOf(address) view returns (uint256)',
  'function tokensOfOwner(address) view returns (uint256[])',
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)'
];
