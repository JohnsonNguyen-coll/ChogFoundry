export function marketConnectionLabel(data,status){
  if(data?.index?.caughtUp===false)return 'Syncing history…';
  if(status==='connected')return data?.provenance.chainId===143?'Live':'Local fork';
  return status==='polling'?'HTTP updates':status==='connecting'?'Connecting…':'Reconnecting…';
}

// Block-only changes do not change balances or a curve quote. Trade/transfer
// changes do, including a rollback to a previous event or holder distribution.
export function marketTradeVersion(data){
  return JSON.stringify([data.token.address,data.launch.graduated,data.trades.at(-1)?.id,data.holders]);
}
