import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeClubPost} from '../src/club-live.mjs';
test('POST and SSE deliver the same saved message once without resetting room state',()=>{
  const data={room:'lounge',posts:[{id:'1',author:'a'}],contributions:[{author:'a',posts:'1'}],membership:{following:true},members:'2',hasOlder:false};
  const post={id:'2',author:'a',content:'Server-confirmed message'};
  const next=mergeClubPost(data,post);
  assert.equal(next.posts.length,2);assert.equal(next.posts[1].content,post.content);
  assert.equal(next.membership,data.membership);assert.equal(next.contributions[0].posts,'2');
  assert.equal(mergeClubPost(next,post),next);assert.equal(data.posts.length,1);
});
test('out-of-order messages stay ordered and retain a bounded live window',()=>{
  const data={posts:Array.from({length:100},(_,i)=>({id:String(i+2),author:'a'})),contributions:[{author:'a',posts:'100'}],hasOlder:false};
  const next=mergeClubPost(data,{id:'103',author:'b',content:'Newest'});
  assert.equal(next.posts.length,100);assert.equal(next.posts[0].id,'3');assert.equal(next.hasOlder,true);
  const delayed=mergeClubPost(next,{id:'102',author:'b',content:'Delayed delivery'});
  assert.deepEqual(delayed.posts.slice(-2).map(p=>p.id),['102','103']);
  assert.equal(delayed.contributions.find(c=>c.author==='b').posts,'2');
});
