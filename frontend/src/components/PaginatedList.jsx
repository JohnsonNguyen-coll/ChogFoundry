import React, { useEffect, useState } from 'react';
import { paginate, pageNumbers } from '../lib/pagination.mjs';

export default function PaginatedList({ items = [], pageSize = 12, resetKey = '', label = 'Items', children }) {
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const result = paginate(items, selection.key === resetKey ? selection.page : 1, pageSize);
  useEffect(() => {
    setSelection(previous => previous.key === resetKey && previous.page === result.page
      ? previous : { key: resetKey, page: result.page });
  }, [resetKey, result.page]);
  const go = page => setSelection({ key: resetKey, page });
  return <>
    {children(result.items, result)}
    {result.pages > 1 && <nav className="list-pagination" aria-label={`${label} pagination`}>
      <span className="pagination-summary" role="status">{result.first}–{result.last} of {result.total}</span>
      <div className="pagination-controls">
        <button type="button" disabled={result.page === 1} onClick={() => go(result.page - 1)}>Previous</button>
        {pageNumbers(result.page, result.pages).map(value => typeof value === 'number'
          ? <button type="button" key={value} aria-label={`Page ${value}`} aria-current={value === result.page ? 'page' : undefined} onClick={() => go(value)}>{value}</button>
          : <span className="pagination-gap" key={value} aria-hidden="true">…</span>)}
        <button type="button" disabled={result.page === result.pages} onClick={() => go(result.page + 1)}>Next</button>
      </div>
    </nav>}
  </>;
}
