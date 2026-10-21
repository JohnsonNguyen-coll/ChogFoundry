import React from 'react';

export function Spinner({label='Loading…', className=''}) {
  return <span className={`loading-indicator ${className}`} role="status"><span className="loading-ring" aria-hidden="true"/><span>{label}</span></span>;
}
