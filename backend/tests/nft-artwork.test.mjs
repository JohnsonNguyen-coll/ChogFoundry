import test from 'node:test';
import assert from 'node:assert/strict';
import {nftArtworkReader,nftIpfsUrls,originalNftImage} from '../src/nft-artwork.mjs';
const collection='0x9f8514cebee138b61806d4651f51d26c8098b463';
const item=`https://opensea.io/item/monad/${collection}/548`;
const original=`https://i2c.seadn.io/monad/${collection}/artwork/original.png`;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2cAAAAASUVORK5CYII=','base64');
const page=(overrides={})=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',sku:'548',url:item,image:original,...overrides})}</script>`;

test('NFT fallback selects only an original image for the exact chain, collection and token; never social previews',()=>{
  assert.equal(originalNftImage(page(),collection,'548'),original);
  for(const overrides of [{sku:'549'},{url:item.replace('/monad/','/ethereum/')},{image:'https://opensea.io/item/monad/anything/opengraph-image'},{image:'https://i2c.seadn.io/collection/other/logo.png'},{image:'https://127.0.0.1/private.png'}])assert.throws(()=>originalNftImage(page(overrides),collection,'548'));
  assert.deepEqual(nftIpfsUrls('https://127.0.0.1/private.json'),[]);
  assert.deepEqual(nftIpfsUrls('ipfs://cid/../private'),[]);
});

test('NFT reader shares in-flight reads and caches original artwork bytes',async()=>{
  let calls=0;
  const reader=nftArtworkReader(collection,{fetchImage:async url=>{
    calls++;assert.ok(!url.includes('opengraph-image'));
    if(url===item)return new Response(page(),{headers:{'content-type':'text/html'}});
    assert.equal(url,original);return new Response(png,{headers:{'content-type':'image/png'}});
  }});
  const [a,b]=await Promise.all([reader('548'),reader('548')]);
  assert.equal(calls,2);assert.equal(a,b);assert.deepEqual(a.bytes,png);
  assert.equal(await reader('548'),a);assert.equal(calls,2);
  await assert.rejects(reader('../548'),e=>e.code==='INVALID_TOKEN_ID');
});

test('tokenURI metadata is preferred over marketplace fallback',async()=>{
  let marketplace=false;
  const reader=nftArtworkReader(collection,{readTokenURI:async id=>{assert.equal(id,'548');return 'ipfs://metadataCid/548.json';},fetchImage:async url=>{
    if(url.includes('opensea')){marketplace=true;throw Error('Unexpected fallback');}
    if(url.endsWith('548.json'))return Response.json({image:'ipfs://imageCid/548.png'});
    return new Response(png,{headers:{'content-type':'image/png'}});
  }});
  assert.deepEqual((await reader('548')).bytes,png);assert.equal(marketplace,false);
});

test('HTML masquerading as an image is rejected without poisoning retries',async()=>{
  let images=0;
  const reader=nftArtworkReader(collection,{fetchImage:async url=>{
    if(url===item)return new Response(page());
    return ++images===1?new Response('<html>Unavailable</html>',{headers:{'content-type':'image/png'}}):new Response(png,{headers:{'content-type':'image/png'}});
  }});
  await assert.rejects(reader('548'),e=>e.code==='ARTWORK_UNAVAILABLE');
  assert.deepEqual((await reader('548')).bytes,png);assert.equal(images,2);
});

test('temporary upstream failure retains previously verified original artwork',async()=>{
  let reads=0;
  const reader=nftArtworkReader(collection,{ttlMs:0,fetchImage:async url=>{
    if(++reads>2)throw Error('Offline');
    return url===item?new Response(page()):new Response(png,{headers:{'content-type':'image/png'}});
  }});
  const cached=await reader('548');assert.equal(await reader('548'),cached);
});
