import { useEffect, useState,useRef,useCallback } from "react";
import { communityRequest } from "../lib/community.mjs";
export default function usePollingApi(route, refresh = 0) {
  const revision=useRef(0);
  const [state, setState] = useState({
    route: null,
    data: null,
    error: "",
    loading: false,
  });
  useEffect(() => {
    const c = new AbortController();
    let timer;
    revision.current++;
    setState(previous=>({route,data:previous.route===route?previous.data:null,error:'',loading:!!route&&!(previous.route===route&&previous.data)}));
    if (!route) return () => c.abort();
    async function poll() {
      const started=revision.current;
      try {
        const data = await communityRequest(route, undefined, c.signal);
        if (!c.signal.aborted&&started===revision.current)
          setState({ route, data, error: "", loading: false });
      } catch (e) {
        if (!c.signal.aborted&&started===revision.current)
          setState(previous=>({route,data:previous.route===route?previous.data:null,error:e.message,loading:false}));
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
  const update=useCallback(updater=>{
    revision.current++;
    setState(previous=>previous.route===route&&previous.data?{...previous,data:updater(previous.data)}:previous);
  },[route]);
  return {...(state.route === route?state:{data:null,error:'',loading:!!route}),update};
}
