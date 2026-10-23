import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate, pageNumbers } from '../src/lib/pagination.mjs';

test('pagination covers every row once, including an incomplete final page', () => {
  const items = Array.from({ length: 53 }, (_, i) => i);
  const combined = Array.from({ length: 5 }, (_, i) => paginate(items, i + 1, 12).items).flat();
  assert.deepEqual(combined, items);
  assert.deepEqual(paginate(items, 5, 12), { items: [48,49,50,51,52], page: 5, pages: 5, offset: 48, first: 49, last: 53, total: 53 });
});
test('empty lists and reduced or filtered datasets stay on a valid page', () => {
  assert.equal(paginate([], 8).page, 1);
  assert.equal(paginate([], 8).first, 0);
  assert.equal(paginate([1,2], 10).page, 1);
  assert.equal(paginate([1,2], -1).page, 1);
  assert.equal(paginate([1,2], NaN).page, 1);
  assert.equal(paginate([1,2], 1, 0).pages, 1);
});
test('page links stay compact and always include both ends and current page', () => {
  assert.deepEqual(pageNumbers(1, 1), [1]);
  assert.deepEqual(pageNumbers(1, 10), [1,2,'gap-10',10]);
  assert.deepEqual(pageNumbers(5, 10), [1,'gap-4',4,5,6,'gap-10',10]);
  assert.deepEqual(pageNumbers(10, 10), [1,'gap-9',9,10]);
});
