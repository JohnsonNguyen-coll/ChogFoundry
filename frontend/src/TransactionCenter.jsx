import {units} from './market-format.mjs';
import PaginatedList from './components/PaginatedList.jsx';
import {statusLabel} from './lib/status-label.mjs';
import { useSelectedWallet } from './WalletProvider.jsx';
import React, { useEffect, useState } from 'react';
import { transactions, subscribe, updateTransaction, terminalTransaction } from './transaction-journal.mjs';
import { inspectReplacement } from './wallet-transaction.mjs';
export default function TransactionCenter(){
  const {provider}=useSelectedWallet();
  const [entries,setEntries]=useState(transactions),[busy,setBusy]=useState(false),[error,setError]=useState(''),[replacement,setReplacement]=useState('');
  useEffect(()=>subscribe(()=>setEntries(transactions())),[]);
  async function verifyReplacement(entry){setBusy(true);setError('');try{updateTransaction(entry.hash,await inspectReplacement(provider,entry,replacement.trim()));setReplacement('');}catch(e){setError(e.message);}finally{setBusy(false);}}
  if(!entries.length)return null;
  return <section className="transaction-center"><h3>Your Mainnet transactions</h3><p className="note">Your pending transactions stay here when you change pages or reload this tab. Confirmation updates automatically, including after you reload. If you replace or cancel a transaction in your wallet, check that transaction here too.</p><PaginatedList items={entries} pageSize={10} label="Your transactions">{page=><>{page.map(entry=><div key={entry.hash}><a href={`https://monadscan.com/tx/${entry.hash}`} target="_blank" rel="noreferrer">{entry.hash} ↗</a><p>{statusLabel(entry.status)} · from {entry.transaction.from}</p>{entry.changedApproval&&<p className="note">Approved limit: {units(entry.changedApproval.approvedAmountRaw)} tokens. Reviewed limit: {units(entry.changedApproval.reviewedAmountRaw)} tokens.</p>}{!terminalTransaction(entry.status)&&<><p className="note">{entry.trackingPaused?'Tracking needs your review.':'Waiting for confirmation… Updates automatically.'}</p>{entry.trackingError&&<p className="message error">{entry.trackingError}</p>}<details><summary>Replaced or cancelled in your wallet?</summary><label>Replacement transaction ID<input value={replacement} onChange={e=>setReplacement(e.target.value)} placeholder="0x…" /></label><button disabled={busy} onClick={()=>verifyReplacement(entry)}>Check replacement transaction</button><p className="note">Use the replacement transaction from the same wallet. We check that it replaced the original; this does not mean the original action succeeded.</p></details></>}</div>)}</>}</PaginatedList>{error&&<p role="alert">{error}</p>}</section>;
}
