import {postId} from './community.mjs';
export function bulkTasks(links, kinds, points, days, now=Date.now()) {
  const ids=[...new Set(links.split(/\s+/).filter(Boolean).map(postId))];
  if(!ids.length || ids.length>20)throw new Error('Enter between 1 and 20 post URLs.');
  if(!kinds.length || kinds.some(kind=>!['like','repost'].includes(kind)))throw new Error('Choose Like or Repost.');
  if(!Number.isInteger(points)||points<1||points>1000000)throw new Error('Enter a valid points value.');
  if(!Number.isInteger(days)||days<1||days>90)throw new Error('Choose between 1 and 90 days.');
  return ids.flatMap(targetPostId=>kinds.map(kind=>({kind,targetPostId,points,title:kind==='like'?"Like ChogNFT’s post":"Repost ChogNFT’s post",startsAt:new Date(now).toISOString(),endsAt:new Date(now+days*86400000).toISOString()})));
}
