import test from 'node:test';
import assert from 'node:assert/strict';
import {bulkTasks} from '../src/lib/bulk-tasks.mjs';
import {taskInput} from '../../backend/src/community-validation.mjs';
test('bulk timestamps with milliseconds pass actual backend validation',()=>{
  const now=Date.now();
  for(const task of bulkTasks('123',['like','repost'],10,14,now)){
    assert.equal(Date.parse(task.startsAt)%1000,0);
    assert.equal(Date.parse(task.endsAt)%1000,0);
    assert.doesNotThrow(()=>taskInput(task));
  }
});
test('bulk tasks deduplicate posts and assign each action its own points and two-week period',()=>{
  const tasks=bulkTasks('https://x.com/ChogNFT/status/123\n123\n456',['like','repost'],10,14,0);
  assert.equal(tasks.length,4);
  assert.equal(tasks[0].title,'Like ChogNFT’s post');
  assert.equal(tasks[1].title,'Repost ChogNFT’s post');
  assert.ok(tasks.every(task=>task.points===10&&Date.parse(task.endsAt)-Date.parse(task.startsAt)===14*86400000));
  assert.throws(()=>bulkTasks('bad-url',['like'],10,14));
  assert.throws(()=>bulkTasks('123',[],10,14));
  assert.throws(()=>bulkTasks('123',['like'],0,14));
});
