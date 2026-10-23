import React,{createContext,useEffect,useRef,useSyncExternalStore} from 'react';
import {useSelectedWallet} from './WalletProvider.jsx';
import {communityRequest} from './lib/community.mjs';
import {createWalletSession} from './wallet-session.mjs';
export const WalletSessionContext=createContext(null);
export default function WalletSessionProvider({children}){
  const {wallet,provider}=useSelectedWallet(),reference=useRef(null);
  if(!reference.current)reference.current=createWalletSession({read:communityRequest,isActive:()=>document.visibilityState==='visible'});
  const controller=reference.current,state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  useEffect(()=>{controller.connect(wallet,provider);return()=>controller.connect(null,null);},[controller,wallet,provider]);
  useEffect(()=>{
    const timer=setInterval(()=>controller.tick(),1000),refresh=setInterval(()=>void controller.refresh(),60000);
    const focus=()=>{if(document.visibilityState==='visible')void controller.refresh();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
    return()=>{clearInterval(timer);clearInterval(refresh);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[controller]);
  return <WalletSessionContext.Provider value={{...state,signIn:controller.signIn,signOut:controller.signOut}}>{children}</WalletSessionContext.Provider>;
}
