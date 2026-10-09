import { ChainReader } from '../src/chain-reader.mjs';
const reader = new ChainReader();
try { console.log(JSON.stringify(await reader.overview(), null, 2)); } finally { reader.close(); }
