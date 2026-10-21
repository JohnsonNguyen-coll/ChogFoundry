import {inspectTransaction} from './wallet-transaction.mjs';
import {transactions,updateTransaction,terminalTransaction} from './transaction-journal.mjs';

export async function monitorTransactions(provider,{signal,intervalMs=2000,entries=transactions,update=updateTransaction,inspect=inspectTransaction}={}) {
  while(!signal.aborted){
    for(const entry of entries().filter(item=>!terminalTransaction(item.status)&&!item.trackingPaused)){
      if(signal.aborted)return;
      try{
        const result=await inspect(provider,entry.hash,entry.transaction);
        if(!signal.aborted)update(entry.hash,{...result,trackingError:null});
      }catch(error){
        if(!signal.aborted)update(entry.hash,{trackingError:error.message,trackingPaused:['TRANSACTION_MISMATCH','RECEIPT_MISMATCH'].includes(error.code)});
      }
    }
    if(signal.aborted)return;
    await new Promise(resolve=>{
      const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};
      const timer=setTimeout(finish,intervalMs);signal.addEventListener('abort',finish,{once:true});
    });
  }
}
