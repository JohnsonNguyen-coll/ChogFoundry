import test from 'node:test';
import assert from 'node:assert/strict';
import { docs, searchDocs } from '../src/lib/docs-content.mjs';
import { mainnetEconomics } from '../../backend/src/mainnet-economics.mjs';

test('every documentation guide has a unique route and usable section anchors', () => {
  assert.equal(new Set(docs.map(doc => doc.slug)).size, docs.length);
  for (const doc of docs) {
    assert.match(doc.slug, /^[a-z-]+$/);
    assert.ok(doc.summary && doc.title && doc.group);
    assert.ok(doc.sections.length >= 3);
    assert.equal(new Set(doc.sections.map(section => section.id)).size, doc.sections.length);
    for (const section of doc.sections) {
      assert.match(section.id, /^[a-z-]+$/);
      assert.ok(section.title);
      assert.ok(section.paragraphs?.length || section.steps?.length || section.bullets?.length || section.table);
    }
  }
});
test('documentation search finds relevant guides by content and all query terms', () => {
  assert.equal(searchDocs('').length, docs.length);
  assert.ok(searchDocs('first buy').some(doc => doc.slug === 'launching'));
  assert.ok(searchDocs('previously earned fees').some(doc => doc.slug === 'studios'));
  assert.ok(searchDocs('PYTH ENTROPY').some(doc => doc.slug === 'campaigns'));
  assert.deepEqual(searchDocs('no_such_documentation_term'), []);
});
test('published token allocation and fee figures match the deployed economics configuration', () => {
  const allocation = docs.find(doc => doc.slug === 'launching').sections.find(section => section.id === 'token-supply').table.rows;
  const tokens = raw => (raw / 10n ** 18n).toLocaleString('en-US');
  assert.equal(allocation[0][1], tokens(mainnetEconomics.saleSupplyRaw));
  assert.equal(allocation[1][1], tokens(mainnetEconomics.graduationInventoryRaw));
  assert.equal(allocation[2][1], tokens(mainnetEconomics.creatorAllocationRaw));
  const split = docs.find(doc => doc.slug === 'fees').sections.find(section => section.id === 'trading-fees').table.rows;
  assert.deepEqual(split.map(row => row[1]), [mainnetEconomics.creatorBps, mainnetEconomics.studioBps, mainnetEconomics.platformBps].map(bps => `${bps / 100}%`));
});
