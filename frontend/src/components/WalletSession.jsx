import React from "react";
import {Spinner} from './Loading.jsx';
import {short} from '../lib/api.mjs';
export default function WalletSession({auth}) {
  if(!auth.wallet)return null;
  return <div className="wallet-session-inline">
    {auth.checking?<Spinner label="Checking sign-in…"/>:auth.matches?<>
      <span className="wallet-session-signed" title={auth.session.wallet}>Signed in · {short(auth.session.wallet)}</span>
      <button className="text-button" onClick={auth.signOut} disabled={auth.busy}>Sign out</button>
    </>:<button className="secondary" disabled={auth.busy} onClick={auth.signIn}>{auth.busy?'Waiting for wallet…':'Sign in to participate'}</button>}
    {auth.error&&<p className="message error" role="alert">{auth.error}</p>}
  </div>;
}
