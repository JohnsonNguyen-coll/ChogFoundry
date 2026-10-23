export function xLinkControl({auth,connection,configured,loading,busy,linked}){
  if(loading)return {disabled:true,label:'Loading X connection…'};
  if(!configured)return {disabled:true,label:'X connection unavailable'};
  if(busy)return {disabled:true,label:'Opening X…'};
  if(connection.status==='connected'&&connection.chainId!==143)return {disabled:false,label:'Switch to Monad',step:'network'};
  if(connection.error)return {disabled:false,label:'Reconnect wallet',step:'reconnect'};
  if(!auth.wallet)return {disabled:false,label:'Connect wallet to link X',step:'connect'};
  if(auth.checking)return {disabled:true,label:'Checking sign-in…'};
  if(auth.busy)return {disabled:true,label:'Waiting for wallet…'};
  if(!auth.matches)return {disabled:false,label:'Sign in and link X',step:'signin'};
  return {disabled:false,label:linked?'Reauthorize X':'Link X',step:'link'};
}
