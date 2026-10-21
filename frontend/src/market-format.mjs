// Keep raw amounts exact; floating point is used only for chart pixel coordinates.
export function units(raw, decimals = 18) {
  const n = BigInt(raw), scale = 10n ** BigInt(decimals);
  const fraction = (n % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${(n / scale).toLocaleString('en-US')}${fraction ? '.' + fraction : ''}`;
}
export function fixedPrice(value) {
  if (!/^\d+(?:\.\d{1,36})?$/.test(value)) throw new Error('Invalid execution price.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10n ** 36n + BigInt(fraction.padEnd(36, '0'));
}
export function candleGeometry(candles) {
  if (!candles.length) return null;
  const values = candles.map(c => ({ ...c, o: fixedPrice(c.open), h: fixedPrice(c.high), l: fixedPrice(c.low), c: fixedPrice(c.close) }));
  const low = values.reduce((a, c) => c.l < a ? c.l : a, values[0].l);
  const high = values.reduce((a, c) => c.h > a ? c.h : a, values[0].h);
  const span = high - low;
  const y = n => span === 0n ? 140 : 245 - Number((n - low) * 210000000n / span) / 1000000;
  const first = values[0].time, last = values.at(-1).time;
  const x = time => last === first ? 440 : 35 + (time - first) / (last - first) * 810;
  const step = values.length > 1 ? Math.min(...values.slice(1).map((c, i) => x(c.time) - x(values[i].time))) : 14;
  return { values, x, y, width: Math.max(1, Math.min(12, step * 0.65)) };
}

export function parseAmount(value, decimals = 18) {
  if(typeof value!=='string'||!new RegExp(`^(0|[1-9][0-9]*)(?:\\.[0-9]{1,${decimals}})?$`).test(value)||value.length>100)throw new Error(`Enter an amount greater than zero, using up to ${decimals} digits after the decimal point.`);
  const [whole,fraction='']=value.split('.');
  const raw=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0'));
  if(raw<=0n||raw>=2n**256n)throw new Error('Enter an amount greater than zero and within the supported limit.');
  return String(raw);
}
