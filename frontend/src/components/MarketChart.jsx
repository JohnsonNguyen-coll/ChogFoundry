import React, {useEffect, useMemo, useRef, useState} from 'react';
import {CandlestickSeries, HistogramSeries, createChart, ColorType} from 'lightweight-charts';
import {decimal, units} from '../market-format.mjs';
import {chartSeries, chartPriceUnit, displayChartPrice,paddedPriceRange} from '../market-chart.mjs';

export default function MarketChart({candles, marketKey}) {
  const element=useRef(null), api=useRef(null), previous=useRef(null);
  const [hover,setHover]=useState(null);
  const scale=chartPriceUnit(candles), series=useMemo(()=>chartSeries(candles,scale.factor),[candles,scale.factor]);
  useEffect(()=>{
    const chart=createChart(element.current,{
      autoSize:true,
      layout:{background:{type:ColorType.Solid,color:'#121020'},textColor:'#8f86a5',fontFamily:'DM Sans, sans-serif',fontSize:10,attributionLogo:true},
      grid:{vertLines:{color:'#252033'},horzLines:{color:'#252033'}},
      rightPriceScale:{borderColor:'#332d46',scaleMargins:{top:.12,bottom:.25}},
      timeScale:{borderColor:'#332d46',timeVisible:true,secondsVisible:false,rightOffset:7,barSpacing:9},
      crosshair:{vertLine:{color:'#8e7daf',labelBackgroundColor:'#34264f'},horzLine:{color:'#8e7daf',labelBackgroundColor:'#34264f'}},
      localization:{priceFormatter:value=>decimal(value.toFixed(12))},
    });
    const price=chart.addSeries(CandlestickSeries,{upColor:'#83d6ba',downColor:'#f49ba9',wickUpColor:'#83d6ba',wickDownColor:'#f49ba9',borderVisible:false,priceFormat:{type:'custom',minMove:0.000000000001,formatter:value=>decimal(value.toFixed(12))},autoscaleInfoProvider:original=>{const info=original();return info?{...info,priceRange:paddedPriceRange(info.priceRange)}:null;}});
    const volume=chart.addSeries(HistogramSeries,{priceScaleId:'volume',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});
    volume.priceScale().applyOptions({scaleMargins:{top:.83,bottom:0},visible:false});
    chart.subscribeCrosshairMove(event=>setHover(event.time??null));
    api.current={chart,price,volume};previous.current=null;
    return()=>{api.current=null;chart.remove();};
  },[marketKey]);
  useEffect(()=>{
    if(!api.current)return;
    const {chart,price,volume}=api.current;
    price.setData(series.prices);volume.setData(series.volumes);
    if(!previous.current||previous.current.factor!==scale.factor){
      if(series.prices.length<=2)chart.timeScale().setVisibleLogicalRange({from:-40,to:10});
      else chart.timeScale().fitContent();
      previous.current={factor:scale.factor};
    }
  },[series,scale.factor,marketKey]);
  const current=candles.find(c=>c.time===hover)??candles.at(-1);
  return <div className="market-chart">
    <div className="chart-readout" aria-live="off">
      <span>{scale.label}</span>
      {current&&<><span>O <b>{displayChartPrice(current.open,scale.factor)}</b></span><span>H <b>{displayChartPrice(current.high,scale.factor)}</b></span><span>L <b>{displayChartPrice(current.low,scale.factor)}</b></span><span>C <b>{displayChartPrice(current.close,scale.factor)}</b></span><span>Vol <b>{units(current.quoteVolumeRaw)} CHOG</b></span></>}
    </div>
    <div className="market-chart-canvas" ref={element} role="img" aria-label={`Candlestick chart, ${scale.label}. Drag to pan and scroll to zoom.`}/>
    {!candles.length&&<div className="chart-empty-overlay">Your first trade starts the chart.</div>}
    <div className="chart-interaction-bar"><span>Drag to pan · Scroll to zoom</span><button className="text-button" onClick={()=>{if(candles.length<=2)api.current?.chart.timeScale().setVisibleLogicalRange({from:-40,to:10});else api.current?.chart.timeScale().fitContent();}}>Reset chart</button></div>
  </div>;
}
