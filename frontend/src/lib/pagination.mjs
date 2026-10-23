export function paginate(items, requestedPage = 1, pageSize = 12) {
  const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 12;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const offset = (page - 1) * size;
  return { items: items.slice(offset, offset + size), page, pages, offset,
    first: items.length ? offset + 1 : 0, last: Math.min(offset + size, items.length), total: items.length };
}

export function pageNumbers(page, pages) {
  return [...new Set([1, page - 1, page, page + 1, pages])]
    .filter(value => value >= 1 && value <= pages).sort((a, b) => a - b)
    .flatMap((value, index, values) => index && value - values[index - 1] > 1 ? ['gap-' + value, value] : [value]);
}
