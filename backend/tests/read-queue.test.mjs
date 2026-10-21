import test from 'node:test';
import assert from 'node:assert/strict';
import {ReadQueue} from '../src/read-queue.mjs';

test('parallel reads wait in order and releasing twice cannot exceed concurrency',async()=>{
  const queue=new ReadQueue({concurrency:2});
  const first=await queue.acquire(),second=await queue.acquire();
  let started=false;
  const pending=queue.acquire().then(release=>{started=true;return release;});
  await Promise.resolve();assert.equal(started,false);assert.equal(queue.active,2);
  first();first();const third=await pending;
  assert.equal(started,true);assert.equal(queue.active,2);
  second();third();assert.equal(queue.active,0);queue.close();
});

test('queue limits, timeout and shutdown release all waiters',async()=>{
  const queue=new ReadQueue({concurrency:1,capacity:1,timeoutMs:20});
  const release=await queue.acquire();
  const timeout=assert.rejects(queue.acquire(),e=>e.code==='READER_WAIT_TIMEOUT');
  await assert.rejects(queue.acquire(),e=>e.code==='READER_CAPACITY');
  await timeout;assert.equal(queue.waiting.length,0);
  const closed=assert.rejects(queue.acquire(),e=>e.code==='READER_CLOSED');
  queue.close();await closed;release();assert.equal(queue.active,0);
  await assert.rejects(queue.acquire(),e=>e.code==='READER_CLOSED');
});
