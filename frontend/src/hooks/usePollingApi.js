import { useEffect, useState } from "react";
import { communityRequest } from "../lib/community.mjs";
export default function usePollingApi(route, refresh = 0) {
  const [state, setState] = useState({
    route: null,
    data: null,
    error: "",
    loading: false,
  });
  useEffect(() => {
    const c = new AbortController();
    let timer;
    setState({ route, data: null, error: "", loading: !!route });
    if (!route) return () => c.abort();
    async function poll() {
      try {
        const data = await communityRequest(route, undefined, c.signal);
        if (!c.signal.aborted)
          setState({ route, data, error: "", loading: false });
      } catch (e) {
        if (!c.signal.aborted)
          setState({ route, data: null, error: e.message, loading: false });
      } finally {
        if (!c.signal.aborted) timer = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => {
      c.abort();
      clearTimeout(timer);
    };
  }, [route, refresh]);
  return state.route === route
    ? state
    : { data: null, error: "", loading: !!route };
}
