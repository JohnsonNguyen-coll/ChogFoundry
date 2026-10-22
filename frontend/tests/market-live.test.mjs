import test from 'node:test';
import assert from 'node:assert/strict';
import {marketConnectionLabel,marketTradeVersion} from '../src/market-live.mjs';

test('an open stream is not labelled live until its history has caught up',()=>{
  const data={index:{caughtUp:false},provenance:{chainId:143}};
  assert.equal(marketConnectionLabel(data,'connected'),'Syncing history…');
  data.index.caughtUp=true;
  assert.equal(marketConnectionLabel(data,'connected'),'Live');
  assert.equal(marketConnectionLabel(data,'polling'),'HTTP updates');
});

test('trade and holder changes refresh the order panel while empty blocks do not',()=>{
  const data={token:{address:'token'},launch:{graduated:false},trades:[{id:'buy'}],holders:{count:2,top:[{balanceRaw:'10'}]}};
  const version=marketTradeVersion(data);
  assert.equal(marketTradeVersion({...data,cursor:'new-block'}),version);
  assert.notEqual(marketTradeVersion({...data,trades:[{id:'sell'}]}),version);
  assert.notEqual(marketTradeVersion({...data,holders:{count:3,top:[]}}),version);
});
