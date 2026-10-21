const labels = {
  simulated:'Ready for wallet review', blocked:'Action needed', sufficient:'Already approved',
  'approval-required':'Spending approval needed', 'nothing-to-claim':'No fees to claim',
  finalized:'Confirmed', reverted:'Failed', confirming:'Confirming', pending:'Pending',
  submitted:'Sent to the network', orphaned:'Confirmation changed — check again',
  'replaced-finalized':'Replacement confirmed',
  'approval-changed':'Approval confirmed with a different spending limit',
  'pending-or-replaced':'Waiting for a network update',
  OWNER_REQUIRED:'Use the wallet that owns this studio NFT.',
  INSUFFICIENT_CHOG_BALANCE:'Your wallet needs more CHOG.',
  INSUFFICIENT_BALANCE:'Your wallet needs more tokens for this trade.',
  FACTORY_APPROVAL_REQUIRED:'Approve CHOG spending for your first buy.',
  APPROVAL_REQUIRED:'Approve token spending before continuing.',
  WALLET_EXECUTION_NOT_CONFIGURED:'Wallet transactions are not enabled yet.',
  SUPABASE_NOT_CONFIGURED:'The app database is not connected.',
  DEPLOYMENT_NOT_CONFIGURED:'Launch contracts have not been connected.',
  DATABASE_MIGRATIONS_REQUIRED:'The app database needs an update.',
};
export function statusLabel(value) {
  return labels[value] ?? String(value ?? 'Not available').replace(/[_-]+/g,' ').replace(/^./,c=>c.toUpperCase());
}
