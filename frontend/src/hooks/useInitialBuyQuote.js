import {useEffect,useState} from 'react';
import {api} from '../lib/api.mjs';
import {parseAmount} from '../market-format.mjs';
export default function useInitialBuyQuote(id,budget) {
  let amount=null;
  try{amount=parseAmount(budget);}catch{}
  const key=id&&/^(0|[1-9][0-9]*)$/.test(id)&&amount?`${id}:${amount}`:null;
  const [state,setState]=useState(null);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    if(!key)return()=>controller.abort();
    const timer=setTimeout(()=>{
      api(`/studios/${id}/launch-quote?initialQuoteIn=${amount}`,controller.signal)
        .then(data=>{if(!controller.signal.aborted)setState({key,data});})
        .catch(error=>{if(!controller.signal.aborted)setState({key,error:error.message});});
    },300);
    return()=>{clearTimeout(timer);controller.abort();};
  },[key,id,amount,attempt]);
  const current=state?.key===key&&key?state:{data:null,error:'',loading:!!key};
  return {...current,retry:()=>{setState(null);setAttempt(n=>n+1);}};
}
