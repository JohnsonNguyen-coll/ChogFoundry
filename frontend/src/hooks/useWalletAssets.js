import { useEffect, useState } from "react";
import { useSelectedWallet } from "../WalletProvider.jsx";
import { api } from "../lib/api.mjs";
export default function useWalletAssets() {
  const { wallet, provider } = useSelectedWallet(),
    [state, setState] = useState({
      wallet: null,
      provider: null,
      data: null,
      error: "",
      loading: false,
    });
  useEffect(() => {
    const controller = new AbortController();
    setState({ wallet, provider, data: null, error: "", loading: !!wallet });
    if (wallet && provider)
      api(`/wallets/${wallet}`, controller.signal)
        .then(async (data) => {
          const accounts = await provider.request({ method: "eth_accounts" }),
            chain = await provider.request({ method: "eth_chainId" });
          if (
            accounts[0]?.toLowerCase() !== wallet.toLowerCase() ||
            BigInt(chain) !== 143n
          )
            throw new Error("Wallet changed while reading your studio NFTs.");
          if (!controller.signal.aborted)
            setState({ wallet, provider, data, error: "", loading: false });
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setState({
              wallet,
              provider,
              data: null,
              error: e.message,
              loading: false,
            });
        });
    return () => controller.abort();
  }, [wallet, provider]);
  return state.wallet === wallet && state.provider === provider
    ? state
    : { wallet, provider, data: null, error: "", loading: !!wallet };
}
