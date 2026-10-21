import test from 'node:test';
import assert from 'node:assert/strict';
import {nftArtworkReader} from '../src/nft-artwork.mjs';
const collection='0x9f8514cebee138b61806d4651f51d26c8098b463';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2cAAAAASUVORK5CYII=','base64');
test('NFT images use a fixed source, share in-flight reads and cache actual image bytes',async()=>{
  let calls=0;
  const reader=nftArtworkReader(collection,{fetchImage:async url=>{
    calls++;assert.equal(url,`https://opensea.io/item/monad/${collection}/548/opengraph-image`);
    return new Response(png,{headers:{'content-type':'image/png'}});
  }});
  const [a,b]=await Promise.all([reader('548'),reader('548')]);
  assert.equal(calls,1);assert.equal(a,b);assert.deepEqual(a.bytes,png);
  assert.equal(await reader('548'),a);assert.equal(calls,1);
  await assert.rejects(reader('../548'),e=>e.code==='INVALID_TOKEN_ID');
  assert.equal(calls,1);
});
test('HTML and failed image requests are rejected and do not poison retries',async()=>{
  let calls=0;
  const reader=nftArtworkReader(collection,{fetchImage:async()=>{
    calls++;return calls===1?new Response('<html>Unavailable</html>',{headers:{'content-type':'image/png'}}):new Response(png,{headers:{'content-type':'image/png'}});
  }});
  await assert.rejects(reader('548'),e=>e.code==='ARTWORK_UNAVAILABLE');
  assert.deepEqual((await reader('548')).bytes,png);assert.equal(calls,2);
});
test('a temporary upstream failure keeps a previously loaded NFT image available',async()=>{
  let calls=0;
  const reader=nftArtworkReader(collection,{ttlMs:0,fetchImage:async()=>{
    if(++calls>1)throw Error('Offline');
    return new Response(png,{headers:{'content-type':'image/png'}});
  }});
  const original=await reader('548');
  assert.equal(await reader('548'),original);assert.equal(calls,2);
});
