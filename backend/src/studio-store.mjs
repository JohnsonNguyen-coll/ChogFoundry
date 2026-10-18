import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './validation.mjs';

export class StudioStore {
  constructor(filename = fileURLToPath(new URL('../data/foundry.sqlite', import.meta.url))) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS studio_profiles (
        studio_key TEXT PRIMARY KEY, token_id TEXT NOT NULL, profile_json TEXT NOT NULL,
        created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL, proof_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS studio_revisions (
        studio_key TEXT NOT NULL, revision INTEGER NOT NULL, author TEXT NOT NULL,
        profile_json TEXT NOT NULL, saved_at TEXT NOT NULL, proof_json TEXT NOT NULL,
        PRIMARY KEY (studio_key, revision), FOREIGN KEY (studio_key) REFERENCES studio_profiles(studio_key)
      );`);
  }
  get(key) {
    const row = this.db.prepare('SELECT * FROM studio_profiles WHERE studio_key=?').get(key);
    if (!row) return null;
    return { key, tokenId: row.token_id, ...JSON.parse(row.profile_json), createdBy: row.created_by, createdAt: row.created_at,
      updatedBy: row.updated_by, updatedAt: row.updated_at, revision: row.revision, ownershipEvidence: JSON.parse(row.proof_json) };
  }
  save(key, tokenId, input, author, evidence) {
    const { expectedRevision, ...profile } = input;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.get(key);
      if ((current?.revision ?? 0) !== expectedRevision) throw new AppError(409, 'REVISION_CONFLICT', 'The studio changed. Reload before saving.');
      const revision = expectedRevision + 1; const now = new Date().toISOString();
      this.db.prepare(`INSERT INTO studio_profiles VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(studio_key) DO UPDATE SET profile_json=excluded.profile_json, updated_by=excluded.updated_by,
        updated_at=excluded.updated_at, revision=excluded.revision, proof_json=excluded.proof_json`).run(
          key, String(tokenId), JSON.stringify(profile), current?.createdBy ?? author, current?.createdAt ?? now,
          author, now, revision, JSON.stringify(evidence));
      this.db.prepare('INSERT INTO studio_revisions VALUES (?,?,?,?,?,?)').run(key, revision, author, JSON.stringify(profile), now, JSON.stringify(evidence));
      this.db.exec('COMMIT'); return this.get(key);
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(prefix = '') {
    return this.db.prepare('SELECT studio_key FROM studio_profiles WHERE substr(studio_key,1,length(?))=? ORDER BY updated_at DESC LIMIT 50').all(prefix, prefix).map(row => this.get(row.studio_key));
  }
  history(key) {
    return this.db.prepare('SELECT revision,author,saved_at,proof_json FROM studio_revisions WHERE studio_key=? ORDER BY revision DESC LIMIT 100').all(key).map(row => ({ revision: row.revision, author: row.author, savedAt: row.saved_at, ownershipEvidence: JSON.parse(row.proof_json) }));
  }
  close() { this.db.close(); }
}

