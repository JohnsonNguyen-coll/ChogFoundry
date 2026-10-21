import test from 'node:test';
import assert from 'node:assert/strict';
import {chartPriceUnit,chartSeries,displayChartPrice,paddedPriceRange} from '../src/market-chart.mjs';

test('small execution prices use clearly labelled million-token units without losing display precision',()=>{
  assert.deepEqual(chartPriceUnit([{close:'0.000800001'}]),{factor:1000000,label:'CHOG per 1M tokens'});
  assert.equal(displayChartPrice('0.000800001234567891234567',1000000),'800');
  assert.equal(displayChartPrice('0.000800129',1000000),'800.13');
  assert.equal(chartPriceUnit([{close:'0.01'}]).factor,1);
  assert.equal(chartPriceUnit([]).factor,1);
});

test('a single flat candle gets a readable axis without altering its execution price',()=>{
  const original={minValue:800.03,maxValue:800.03};
  const range=paddedPriceRange(original);
  assert.ok(range.minValue<800&&range.maxValue>801);
  assert.equal(range.maxValue-range.minValue>0.01,true);
  assert.deepEqual(original,{minValue:800.03,maxValue:800.03});
  assert.deepEqual(paddedPriceRange({minValue:700,maxValue:900}),{minValue:700,maxValue:900});
  assert.equal(paddedPriceRange(null),null);
});

test('chart conversion preserves recorded timestamps, OHLC and actual quote volume; empty history stays empty',()=>{
  const candles=[{time:100,open:'0.0008',high:'0.0009',low:'0.0007',close:'0.00085',quoteVolumeRaw:'10000000000000000000'},
    {time:700,open:'0.00085',high:'0.00085',low:'0.0008',close:'0.0008',quoteVolumeRaw:'2000000000000000000'}];
  const before=JSON.stringify(candles),result=chartSeries(candles,1000000);
  assert.deepEqual(result.prices.map(c=>c.time),[100,700]);
  assert.equal(result.prices[0].open,800);
  assert.equal(result.prices[0].high,900);
  assert.deepEqual(result.volumes.map(c=>c.value),[10,2]);
  assert.notEqual(result.volumes[0].color,result.volumes[1].color);
  assert.equal(JSON.stringify(candles),before);
  assert.deepEqual(chartSeries([]),{prices:[],volumes:[]});
});
