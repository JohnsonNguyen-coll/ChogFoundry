import { useEffect, useState } from "react";
import { api } from "../lib/api.mjs";
export default function useApi(route, refresh = 0) {
  const [state, setState] = useState({
    route: null,
    data: null,
    error: "",
    loading: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    setState({ route, data: null, error: "", loading: !!route });
    if (route)
      api(route, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted)
            setState({ route, data, error: "", loading: false });
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setState({ route, data: null, error: e.message, loading: false });
        });
    return () => controller.abort();
  }, [route, refresh]);
  return state.route === route
    ? state
    : { data: null, error: "", loading: !!route };
}
