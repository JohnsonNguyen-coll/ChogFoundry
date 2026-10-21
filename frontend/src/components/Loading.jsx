import React, {useEffect, useState, useSyncExternalStore} from 'react';
import {useLocation} from 'react-router-dom';
import {loadingVersion, pendingRequests, subscribeLoading} from '../lib/loading.mjs';

export function Spinner({label='Loading…', className=''}) {
  return <span className={`loading-indicator ${className}`} role="status"><span className="loading-ring" aria-hidden="true"/><span>{label}</span></span>;
}

export default function RouteLoading() {
  const location = useLocation(), route = location.pathname + location.search;
  useSyncExternalStore(subscribeLoading, loadingVersion, () => 0);
  const busy = pendingRequests(route) > 0;
  const [visibleRoute, setVisibleRoute] = useState(null);
  useEffect(() => {
    setVisibleRoute(null);
    if (!busy) return;
    // Fast reads need no flash; slow reads stay visible until they finish.
    const timer = setTimeout(() => setVisibleRoute(route), 180);
    return () => clearTimeout(timer);
  }, [busy, route]);
  return busy && visibleRoute === route ? <div className="route-loading"><Spinner label="Loading data…"/></div> : null;
}
