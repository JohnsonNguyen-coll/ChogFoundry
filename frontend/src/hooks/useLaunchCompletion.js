import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {subscribe,transactions,updateTransaction} from '../transaction-journal.mjs';
import {api} from '../lib/api.mjs';
import {unfinishedLaunch,verifiedLaunchResult} from '../launch-completion.mjs';
export default function useLaunchCompletion({id,wallet,onComplete}){
  const journal=useSyncExternalStore(subscribe,transactions,transactions);
  const [state,setState]=useState(null),life=useRef(null),activeHash=useRef(null),callback=useRef(onComplete);
  callback.current=onComplete;
  useEffect(()=>{
    const controller=new AbortController();life.current=controller;activeHash.current=null;setState(null);
    return()=>controller.abort();
  },[id,wallet]);
  const complete=useCallback(async hash=>{
    if(!id||!wallet||!life.current||activeHash.current===hash||life.current.signal.aborted)return;
    activeHash.current=hash;const signal=life.current.signal;
    setState({hash,loading:true,error:''});
    try{
      const body=verifiedLaunchResult(await api(`/studios/${id}/launch-receipt?transactionHash=${encodeURIComponent(hash)}`,signal),{id,hash,wallet});
      if(signal.aborted)return;
      updateTransaction(hash,{launchOpened:true,createdToken:body.receipt.tokenAddress});
      setState({hash,loading:false,data:body,error:''});
      callback.current?.(body);
    }catch(error){if(!signal.aborted)setState({hash,loading:false,error:error.message});}
  },[id,wallet]);
  const recover=unfinishedLaunch(journal,id,wallet);
  useEffect(()=>{if(recover)void complete(recover.hash);},[recover?.hash,complete]);
  return {...state,complete,retry:()=>{activeHash.current=null;if(state?.hash)void complete(state.hash);}};
}
