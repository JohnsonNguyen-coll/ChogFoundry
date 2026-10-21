import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {subscribe,transactions,terminalTransaction} from '../transaction-journal.mjs';
export default function useTrackedTransaction(onConfirmed,{expected,snapshotBlock}={}){
  const journal=useSyncExternalStore(subscribe,transactions,transactions);
  const [submitted,setSubmitted]=useState(null),handled=useRef(new Set()),callback=useRef(onConfirmed);
  callback.current=onConfirmed;
  const recovered=expected?[...journal].reverse().find(entry=>
    entry.transaction.from.toLowerCase()===expected.from.toLowerCase()&&
    entry.transaction.to.toLowerCase()===expected.to.toLowerCase()&&
    entry.transaction.data.toLowerCase()===expected.data.toLowerCase()&&
    (!terminalTransaction(entry.status)||entry.blockNumber>snapshotBlock)
  ):null;
  const transaction=submitted?(journal.find(entry=>entry.hash===submitted.hash)||{...submitted,status:'submitted'}):recovered;
  useEffect(()=>{
    if(!transaction||!terminalTransaction(transaction.status)||handled.current.has(transaction.hash))return;
    handled.current.add(transaction.hash);
    if(['finalized','approval-changed'].includes(transaction.status))callback.current?.(transaction);
  },[transaction]);
  return {transaction,pending:!!transaction&&!terminalTransaction(transaction.status),track:setSubmitted};
}
