import React, { createContext, useContext, useEffect, useState } from 'react';
import { WagmiProvider, useAccount, useConfig } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { walletConfig } from './wallet-config.mjs';
const Context=createContext(null),queryClient=new QueryClient();
function ConnectionBridge({children}){
  const {address,chainId,connector,status}=useAccount(),config=useConfig();
  const [resolved,setResolved]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    let alive=true;setResolved(null);setError('');
    if(status!=='connected'||!address||chainId!==143||!connector)return()=>{alive=false;};
    const assertSelected=()=>{
      const current=config.state.connections.get(config.state.current);
      if(!alive||config.state.status!=='connected'||current?.connector.uid!==connector.uid||current?.accounts[0]?.toLowerCase()!==address.toLowerCase()||current.chainId!==143)throw new Error('Wallet connection changed. Refresh the review before continuing.');
    };
    connector.getProvider().then(raw=>{
      assertSelected();if(!raw?.request)throw new Error('Selected wallet has no EIP-1193 provider.');
      const provider={
        request:async args=>{assertSelected();const result=await raw.request(args);if(args.method!=='eth_sendTransaction')assertSelected();return result;},
        on:(event,listener)=>raw.on?.(event,listener),
        removeListener:(event,listener)=>raw.removeListener?.(event,listener),
      };
      if(alive)setResolved({provider,address,chainId,uid:connector.uid});
    }).catch(e=>{if(alive)setError(e.message||'Selected wallet provider is unavailable.');});
    return()=>{alive=false;};
  },[address,chainId,connector,status,config]);
  const ready=status==='connected'&&chainId===143&&resolved?.uid===connector?.uid&&resolved?.chainId===chainId&&resolved?.address.toLowerCase()===address?.toLowerCase();
  return <Context.Provider value={{wallet:ready?address:null,provider:ready?resolved.provider:null,chainId,status,error}}>{children}</Context.Provider>;
}
export function useSelectedWallet(){const context=useContext(Context);if(!context)throw new Error('Wallet provider is missing.');return context;}
export default function WalletProvider({children}){
  return <WagmiProvider config={walletConfig}><QueryClientProvider client={queryClient}><RainbowKitProvider locale="en-US" modalSize="compact" theme={lightTheme({accentColor:'#c3ed65',accentColorForeground:'#172019',borderRadius:'small',fontStack:'system',overlayBlur:'small'})}><ConnectionBridge>{children}</ConnectionBridge></RainbowKitProvider></QueryClientProvider></WagmiProvider>;
}
