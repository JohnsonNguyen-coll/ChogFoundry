import {fixedPrice,units} from './market-format.mjs';

export function paddedPriceRange(range) {
  if(!range)return range;
  const middle=(range.minValue+range.maxValue)/2;
  const padding=Math.max(Math.abs(middle)*0.005,0.01);
  return range.maxValue-range.minValue<padding*2
    ?{...range,minValue:Math.max(0,middle-padding),maxValue:middle+padding}:range;
}

// Numbers below are chart coordinates only. Contract amounts remain exact integers.
export function displayChartPrice(value,factor=1) {
  return units(fixedPrice(value)*BigInt(factor),36);
}
export function chartPriceUnit(candles) {
  const last=candles.at(-1);
  return last&&Number(last.close)>0&&Number(last.close)<0.01
    ?{factor:1_000_000,label:'CHOG per 1M tokens'}
    :{factor:1,label:'CHOG per token'};
}

export function chartSeries(candles,factor=1) {
  return {
    prices:candles.map(c=>({time:c.time,open:Number(c.open)*factor,high:Number(c.high)*factor,low:Number(c.low)*factor,close:Number(c.close)*factor})),
    volumes:candles.map(c=>({time:c.time,value:Number(c.quoteVolumeRaw)/1e18,color:Number(c.close)>=Number(c.open)?'#83d6ba30':'#f49ba930'})),
  };
}
