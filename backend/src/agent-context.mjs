import {AppError} from './validation.mjs';

export function agentTask(value='general'){
  if(!['general','concept','launch','community','token'].includes(value))throw new AppError(400,'INVALID_AGENT_TASK','Choose an assistant task.');
  return value;
}
const clip=(value,limit)=>typeof value==='string'?Array.from(value).slice(0,limit).join(''):null;
const source=(id,value={})=>({id,...Object.fromEntries(['chainId','blockNumber','blockHash','blockTime','fetchedAt','readAt','revision','updatedAt','truncated'].filter(key=>value[key]!=null).map(key=>[key,value[key]]))});

// Explicit allowlists: no NFT metadata URLs, RPC details, proofs, transaction
// history, old conversations or full holder tables are sent to the AI provider.
export function compactAgentContext({task='general',studio,profile,club,market}){
  task=agentTask(task);
  const context={task,sources:[source('studio-onchain',studio.provenance)],studio:{id:studio.nft.tokenId,collectionName:studio.nft.collectionName,...(['general','launch','token'].includes(task)?{collection:studio.nft.collection,owner:studio.nft.owner}:{})},omitted:['NFT metadata URLs','transaction history','previous assistant conversations']};
  if(profile){
    context.profile={name:clip(profile.name,100)};
    if(['general','concept'].includes(task)){
      context.profile.description=clip(profile.description,500);
      if(Array.from(profile.description||'').length>500)context.profile.descriptionTruncated=true;
    }
    context.sources.push(source('studio-profile',{revision:profile.revision,updatedAt:profile.updatedAt}));
  }
  if(task==='community'){
    const posts=(club?.posts||[]).filter(post=>!post.hidden),recent=posts.slice(-5);
    const truncated=!!club?.hasOlder||posts.length>5||recent.some(post=>Array.from(post.content||'').length>240);
    context.chat=recent.map(post=>({author:post.author,content:clip(post.content,240),createdAt:post.createdAt}));
    context.sources.push(source('club-lounge',{readAt:new Date().toISOString(),truncated}));
    context.chatScope='Up to 5 recent public lounge messages, at most 240 characters each.';
  }else context.omitted.push('club messages; choose Catch up on the club to include them');
  if(market){
    context.tokenInspection={token:{address:market.token.address,name:clip(market.token.name,64),symbol:clip(market.token.symbol,12),decimals:market.token.decimals,supplyRaw:market.token.supplyRaw},launch:{creator:market.launch.creator,graduated:market.launch.graduated},pool:market.pool?{lpFeeUnits:market.pool.lpFeeUnits,hook:market.pool.hook,liquidityLock:market.pool.liquidityLock}:null,holders:market.holders?{count:market.holders.count,includesProtocolContracts:market.holders.includesProtocolContracts,top:market.holders.top.slice(0,5).map(holder=>({wallet:holder.wallet,shareBps:holder.shareBps,role:holder.role})),truncated:market.holders.count>5}:null,holderStatus:clip(market.holderStatus,180)};
    context.sources.push(source('token-onchain',{...market.provenance,...market.snapshot}));
  }
  return context;
}
