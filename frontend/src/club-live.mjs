// Only merge server-confirmed posts. A POST response and its SSE event may race.
export function mergeClubPost(data,post){
  if(!post?.id||data.posts.some(existing=>existing.id===post.id))return data;
  const contributions=data.contributions.map(c=>({...c})),author=contributions.find(c=>c.author===post.author);
  if(author)author.posts=String(BigInt(author.posts)+1n);else contributions.push({author:post.author,posts:'1'});
  contributions.sort((a,b)=>BigInt(a.posts)===BigInt(b.posts)?a.author.localeCompare(b.author):BigInt(a.posts)>BigInt(b.posts)?-1:1);
  const posts=[...data.posts,post].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
  return {...data,posts:posts.slice(-100),hasOlder:data.hasOlder||posts.length>100,contributions:contributions.slice(0,20)};
}
