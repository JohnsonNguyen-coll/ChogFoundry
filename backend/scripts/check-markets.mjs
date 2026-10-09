import { writeFileSync } from 'node:fs';
import { inspectMarkets } from './market-inspection.mjs';
const report = await inspectMarkets();
const output = JSON.stringify(report, null, 2);
if (process.argv.includes('--record')) writeFileSync(new URL('../../docs/research/MARKET_SNAPSHOT.json', import.meta.url), output);
console.log(output);
