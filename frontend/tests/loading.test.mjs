import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadingFetch,pendingRequests,subscribeLoading} from '../src/lib/loading.mjs';

test('loading tracks overlapping requests and clears success, failure and cancellation', async () => {
  const original=globalThis.fetch;
  let complete, fail;
  const unsubscribe=subscribeLoading(()=>{});
  try {
    globalThis.fetch=()=>new Promise(resolve=>{complete=resolve;});
    const first=loadingFetch('/api/first');
    globalThis.fetch=()=>new Promise((resolve,reject)=>{fail=reject;});
    const second=loadingFetch('/api/second');
    assert.equal(pendingRequests('/'),2);
    complete({ok:true}); await first;
    assert.equal(pendingRequests('/'),1);
    fail(new Error('Offline'));
    await assert.rejects(second,/Offline/);
    assert.equal(pendingRequests('/'),0);
    const controller=new AbortController();
    globalThis.fetch=()=>new Promise(resolve=>{complete=resolve;});
    const cancelled=loadingFetch('/api/third',{signal:controller.signal});
    assert.equal(pendingRequests('/'),1);
    controller.abort();
    assert.equal(pendingRequests('/'),0);
    complete({ok:true}); await cancelled;
    assert.equal(pendingRequests('/'),0);
  } finally { globalThis.fetch=original; unsubscribe(); }
});

test('requests are scoped to the page that started them', async () => {
  const originalFetch=globalThis.fetch, originalWindow=globalThis.window;
  let complete;
  try {
    globalThis.window={location:{pathname:'/app/markets',search:''}};
    globalThis.fetch=()=>new Promise(resolve=>{complete=resolve;});
    const request=loadingFetch('/api/tokens');
    globalThis.window.location.pathname='/app/clubs';
    assert.equal(pendingRequests('/app/markets'),1);
    assert.equal(pendingRequests('/app/clubs'),0);
    complete({ok:true}); await request;
    assert.equal(pendingRequests('/app/markets'),0);
  } finally {
    globalThis.fetch=originalFetch;
    if(originalWindow===undefined)delete globalThis.window;
    else globalThis.window=originalWindow;
  }
});
