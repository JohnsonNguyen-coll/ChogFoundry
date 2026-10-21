import { useEffect, useRef, useState } from "react";
import { useSelectedWallet } from "../WalletProvider.jsx";
import { communityRequest } from "../lib/community.mjs";
export default function useWalletSession() {
  const { wallet, provider } = useSelectedWallet(),
    [session, setSession] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(true),
    [tick, setTick] = useState(0),
    life = useRef(null);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    setSession(null);
    setChecking(true);
    setError("");
    setBusy(false);
    communityRequest("/session", undefined, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setSession(r.session);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      }).finally(()=>{if(!c.signal.aborted)setChecking(false);});
    const timer = setInterval(() => setTick((n) => n + 1), 10000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, [wallet, provider]);
  const matches =
    !!wallet &&
    session?.wallet.toLowerCase() === wallet.toLowerCase() &&
    Date.parse(session.expiresAt) > Date.now();
  async function signIn() {
    if (!wallet || !provider || busy || matches) return;
    const signal = life.current.signal;
    setBusy(true);
    setError("");
    try {
      const identity = async () => {
        signal.throwIfAborted();
        const accounts = await provider.request({ method: "eth_accounts" }),
          chain = await provider.request({ method: "eth_chainId" });
        if (
          accounts[0]?.toLowerCase() !== wallet.toLowerCase() ||
          BigInt(chain) !== 143n
        )
          throw new Error("Use the selected wallet on Monad Mainnet.");
      };
      await identity();
      const challenge = await communityRequest(
        "/auth/challenge",
        { wallet },
        signal,
      );
      const hex =
        "0x" +
        Array.from(new TextEncoder().encode(challenge.message), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
      const signature = await provider.request({
        method: "personal_sign",
        params: [hex, wallet],
      });
      await identity();
      const result = await communityRequest(
        "/auth/verify",
        { ...challenge, signature },
        signal,
      );
      if (!signal.aborted) setSession(result.session);
    } catch (e) {
      if (!signal.aborted) setError(e.message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  async function signOut() {
    const signal = life.current.signal;
    setBusy(true);
    try {
      await communityRequest("/auth/logout", {}, signal);
      if (!signal.aborted) setSession(null);
    } catch (e) {
      if (!signal.aborted) setError(e.message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return {
    wallet,
    session: matches ? session : null,
    matches,
    busy,
    checking,
    error,
    signIn,
    signOut,
    tick,
  };
}
