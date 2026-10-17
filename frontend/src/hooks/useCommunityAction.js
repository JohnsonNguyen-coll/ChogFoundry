import { useEffect, useRef, useState } from "react";
export default function useCommunityAction(identity) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    life = useRef(null);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    setBusy(false);
    setError("");
    setNotice("");
    return () => c.abort();
  }, [identity]);
  async function run(action) {
    if (busy) return;
    const signal = life.current.signal;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action(signal);
      if (!signal.aborted)
        setNotice(typeof result === "string" ? result : "Saved.");
    } catch (e) {
      if (!signal.aborted) setError(e.message);
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return { busy, error, notice, run };
}
