import React from "react";
import {Spinner} from './Loading.jsx';
export default function WalletSession({auth}) {
  if(!auth.wallet||auth.matches)return null;
  return <div className="wallet-session-inline">
    {auth.checking?<Spinner label="Checking sign-in…"/>:<button className="secondary" disabled={auth.busy} onClick={auth.signIn}>{auth.busy?'Waiting for wallet…':'Sign in to participate'}</button>}
    {auth.error&&<p className="message error" role="alert">{auth.error}</p>}
  </div>;
}
