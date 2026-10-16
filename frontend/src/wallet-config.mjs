import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { injectedWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
import { monad } from 'wagmi/chains';
const suppliedId=(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID||'').trim();
export const walletConnectConfigured=/^[0-9a-f]{32}$/i.test(suppliedId);
export const walletConfigurationNote=walletConnectConfigured?null:suppliedId?'WalletConnect Project ID is invalid. Browser wallets remain available.':'Mobile WalletConnect requires a Project ID. Browser wallets are available.';
export const walletConfig=createConfig({
  chains:[monad],
  connectors:connectorsForWallets([{groupName:'Connect your wallet',wallets:walletConnectConfigured?[injectedWallet,walletConnectWallet]:[injectedWallet]}],{appName:'Chog Foundry',projectId:walletConnectConfigured?suppliedId:''}),
  transports:{[monad.id]:http('https://rpc.monad.xyz')},
  multiInjectedProviderDiscovery:true,
});
