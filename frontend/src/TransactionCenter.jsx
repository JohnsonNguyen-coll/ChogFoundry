import { useSelectedWallet } from './WalletProvider.jsx';
import React, { useEffect, useState } from 'react';
import { transactions, subscribe, updateTransaction } from './transaction-journal.mjs';
import { inspectTransaction, inspectReplacement } from './wallet-transaction.mjs';
export default function TransactionCenter(){
  const {provider}=useSelectedWallet();
  const [entries,setEntries]=useState(transactions),[busy,setBusy]=useState(false),[error,setError]=useState(''),[replacement,setReplacement]=useState('');
  useEffect(()=>subscribe(()=>setEntries(transactions())),[]);
  async function check(entry){setBusy(true);setError('');try{if(!provider)throw new Error('Open your wallet to check transaction finality.');updateTransaction(entry.hash,await inspectTransaction(provider,entry.hash,entry.transaction));}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function verifyReplacement(entry){setBusy(true);setError('');try{updateTransaction(entry.hash,await inspectReplacement(provider,entry,replacement.trim()));setReplacement('');}catch(e){setError(e.message);}finally{setBusy(false);}}
  if(!entries.length)return null;
  return <section className="transaction-center"><h3>Your Mainnet transactions</h3><p className="note">Pending transactions stay here across form changes and page reloads in this tab. Check finality before refreshing approval or settlement. Replacement/cancellation in your wallet is not automatically treated as success; inspect its receipt separately.</p>{entries.map(entry=><div key={entry.hash}><a href={`https://monadscan.com/tx/${entry.hash}`} target="_blank" rel="noreferrer">{entry.hash} ↗</a><p>{entry.status} · from {entry.transaction.from}</p>{!['finalized','reverted','replaced-finalized'].includes(entry.status)&&<><button disabled={busy} onClick={()=>check(entry)}>Check transaction finality</button><details><summary>Replaced or cancelled in your wallet?</summary><label>Replacement transaction hash<input value={replacement} onChange={e=>setReplacement(e.target.value)} placeholder="0x…" /></label><button disabled={busy} onClick={()=>verifyReplacement(entry)}>Verify finalized replacement</button><p className="note">Same sender and nonce are required. A finalized replacement unlocks a fresh review; it does not prove the original action succeeded.</p></details></>}</div>)}{error&&<p role="alert">{error}</p>}</section>;
}
