import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http, fallback } from 'wagmi';
import { monad } from 'wagmi/chains';
const suppliedId=(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID||'').trim();
export const walletConnectConfigured=/^[0-9a-f]{32}$/i.test(suppliedId);
export const walletConfigurationNote=walletConnectConfigured?null:suppliedId?'WalletConnect Project ID is invalid. Browser wallets remain available.':'Mobile WalletConnect requires a Project ID. Browser wallets are available.';
export const walletConfig=createConfig({
  chains:[monad],
  connectors:connectorsForWallets([{groupName:'Connect your wallet',wallets:walletConnectConfigured?[injectedWallet,walletConnectWallet]:[injectedWallet]}],{appName:'Chog Foundry',projectId:walletConnectConfigured?suppliedId:''}),
  transports:{[monad.id]:fallback([
    ...['https://rpc.monad.xyz','https://rpc1.monad.xyz','https://rpc2.monad.xyz','https://rpc3.monad.xyz','https://rpc-mainnet.monadinfra.com'].map(url=>http(url,{retryCount:0,timeout:5000})),
    // Backend retries the public pool before its backend-only private fallback.
    http('/api/rpc',{retryCount:0,timeout:30000}),
  ],{rank:false,retryCount:0})},
  multiInjectedProviderDiscovery:true,
});
