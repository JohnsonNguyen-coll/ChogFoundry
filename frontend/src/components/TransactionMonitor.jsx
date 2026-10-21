import {useEffect} from 'react';
import {useSelectedWallet} from '../WalletProvider.jsx';
import {monitorTransactions} from '../transaction-monitor.mjs';
export default function TransactionMonitor(){
  const {provider}=useSelectedWallet();
  useEffect(()=>{
    if(!provider)return;
    const controller=new AbortController();
    void monitorTransactions(provider,{signal:controller.signal});
    return()=>controller.abort();
  },[provider]);
  return null;
}
