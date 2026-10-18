import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioStore } from '../src/studio-store.mjs';
import { profileInput } from '../src/profile-validation.mjs';

test('profiles reject unsafe URLs, oversized fields and unknown configuration', () => {
  const valid = { name: 'Community studio', description: '', website: '', coverUrl: '', expectedRevision: 0 };
  assert.equal(profileInput(valid).name, valid.name);
  for (const change of [{ website: 'javascript:alert(1)' }, { website: 'http://example.com' }, { coverUrl: 'https://user:password@example.com' }, { name: 'x'.repeat(81) }, { expectedRevision: -1 }, { mintAllowed: true }]) {
    assert.throws(() => profileInput({ ...valid, ...change }));
  }
});

test('real SQLite transactions preserve attribution and reject stale revisions', () => {
  // Storage-only test: no chain proof or ownership claim is supplied.
  const store = new StudioStore(':memory:');
  const input = profileInput({ name: 'First revision', description: '', website: '', coverUrl: '', expectedRevision: 0 });
  try {
    store.save('storage-test', '0', input, 'first author', null);
    store.save('storage-test', '0', { ...input, name: 'Second revision', expectedRevision: 1 }, 'second author', null);
    assert.equal(store.get('storage-test').createdBy, 'first author');
    assert.equal(store.get('storage-test').updatedBy, 'second author');
    assert.deepEqual(store.history('storage-test').map(x => x.author), ['second author', 'first author']);
    assert.throws(() => store.save('storage-test', '0', input, 'third author', null), /changed/);
    assert.equal(store.get('storage-test').revision, 2);
    assert.equal(store.list().length, 1);
    store.save('143:collection-a:1557', '1557', input, 'storage author', null);
    store.save('143:collection-b:1557', '1557', input, 'storage author', null);
    assert.deepEqual(store.list('143:collection-a:').map(p => p.key), ['143:collection-a:1557']);
  } finally { store.close(); }
});

test('studio profiles survive closing and reopening a real SQLite file', async () => {
  const { mkdtempSync, readdirSync, unlinkSync, rmdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = mkdtempSync(join(tmpdir(), 'chog-storage-test-'));
  const filename = join(folder, 'profiles.sqlite');
  let store;
  try {
    store = new StudioStore(filename);
    store.save('storage-only', '0', profileInput({ name: 'Persistent revision', description: '', website: '', coverUrl: '', expectedRevision: 0 }), 'storage author', null);
    store.close(); store = new StudioStore(filename);
    assert.equal(store.get('storage-only').name, 'Persistent revision');
    assert.equal(store.history('storage-only')[0].author, 'storage author');
    // Verify the legacy importer can back up a read-only source, including committed WAL data.
    const { DatabaseSync } = await import('node:sqlite');
    const readonly = new DatabaseSync(filename, { readOnly: true });
    const backupPath = join(folder, 'backup.sqlite');
    try { readonly.prepare('VACUUM INTO ?').run(backupPath); } finally { readonly.close(); }
    const backup = new DatabaseSync(backupPath, { readOnly: true });
    try {
      assert.equal(backup.prepare('SELECT created_by FROM studio_profiles').get().created_by, 'storage author');
      assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM studio_revisions').get().n, 1);
    } finally { backup.close(); }

  } finally {
    store?.close();
    for (const entry of readdirSync(folder)) unlinkSync(join(folder, entry));
    rmdirSync(folder);
  }
});
