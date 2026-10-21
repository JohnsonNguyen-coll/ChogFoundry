import {decodeFunctionData,parseAbi} from 'viem';
const abi=parseAbi(['function launch((uint256 nftId,string name,string symbol,uint256 initialQuoteIn,uint256 minTokenOut,uint256 deadline) params) returns (address)']);
export function unfinishedLaunch(entries,id,wallet){
  if(id==null||!wallet)return null;
  const matches=entries.filter(entry=>{
    if(entry.status!=='finalized'||entry.transaction?.from?.toLowerCase()!==wallet.toLowerCase())return false;
    try{
      const decoded=decodeFunctionData({abi,data:entry.transaction.data});
      return BigInt(entry.transaction.chainId)===143n&&decoded.functionName==='launch'&&String(decoded.args[0].nftId)===String(id);
    }catch{return false;}
  });
  const latest=matches.at(-1);
  return latest&&!latest.launchOpened?latest:null;
}
export function verifiedLaunchResult(body,{id,hash,wallet}){
  const receipt=body.receipt;
  if(receipt?.status!=='verified-launch'||String(receipt.nftId)!==String(id)||receipt.transactionHash?.toLowerCase()!==hash.toLowerCase()||receipt.creator?.toLowerCase()!==wallet.toLowerCase()||body.provenance?.chainId!==143||body.provenance?.finality!=='finalized'||!/^0x[0-9a-f]{40}$/i.test(receipt.tokenAddress)||receipt.tokenAddress.toLowerCase()!==body.token?.address?.toLowerCase())throw new Error('The created token could not be verified. Try loading it again.');
  return body;
}
