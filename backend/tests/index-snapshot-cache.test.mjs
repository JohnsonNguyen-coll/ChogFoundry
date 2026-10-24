import test from 'node:test';
import assert from 'node:assert/strict';
import {IndexSnapshotCache} from '../src/index-snapshot-cache.mjs';
test('same-revision readers share work but cannot mutate each other’s results',async()=>{
  const cache=new IndexSnapshotCache();let loads=0;
  const load=async()=>{loads++;return {trades:[{id:'trade'}]};};
  const [a,b]=await Promise.all([cache.read(1,'token',load),cache.read(1,'token',load)]);
  assert.equal(loads,1);a.trades[0].id='changed';assert.equal(b.trades[0].id,'trade');
  await cache.read(2,'token',load);assert.equal(loads,2);
  await cache.read(3,'token',load);assert.equal(loads,3,'Rollback revisions also invalidate snapshots');
});
test('failed reads are retried and cache memory is bounded',async()=>{
  const cache=new IndexSnapshotCache(2);
  await assert.rejects(cache.read(1,'a',()=>{throw Error('offline');}));
  assert.equal(await cache.read(1,'a',()=>1),1);
  await cache.read(1,'b',()=>2);await cache.read(1,'c',()=>3);
  assert.equal(cache.entries.size,2);
  assert.equal(await cache.read(1,'a',()=>4),4);
});
