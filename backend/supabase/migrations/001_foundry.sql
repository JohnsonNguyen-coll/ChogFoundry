-- Backend-only tables; this migration does not move funds or seed application data.
CREATE SCHEMA IF NOT EXISTS foundry;
REVOKE ALL ON SCHEMA foundry FROM PUBLIC;
CREATE TABLE IF NOT EXISTS foundry.schema_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS foundry.studio_profiles(
  studio_key text PRIMARY KEY,token_id text NOT NULL CHECK(token_id ~ '^(0|[1-9][0-9]*)$'),profile_json jsonb NOT NULL,
  created_by text NOT NULL,created_at text NOT NULL,updated_by text NOT NULL,updated_at text NOT NULL,
  revision bigint NOT NULL CHECK(revision>0 AND revision<=9007199254740991),proof_json jsonb);
CREATE INDEX IF NOT EXISTS studio_profiles_updated ON foundry.studio_profiles(updated_at DESC);
CREATE TABLE IF NOT EXISTS foundry.studio_revisions(
  studio_key text NOT NULL REFERENCES foundry.studio_profiles(studio_key),revision bigint NOT NULL,author text NOT NULL,
  profile_json jsonb NOT NULL,saved_at text NOT NULL,proof_json jsonb,PRIMARY KEY(studio_key,revision));
CREATE TABLE IF NOT EXISTS foundry.market_indexes(
  index_key text PRIMARY KEY,config_json jsonb NOT NULL,anchor_json jsonb,revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0 AND revision<=9007199254740991));
CREATE TABLE IF NOT EXISTS foundry.market_chunks(
  index_key text NOT NULL REFERENCES foundry.market_indexes(index_key),end_block bigint NOT NULL CHECK(end_block>=0 AND end_block<=9007199254740991),
  start_block bigint NOT NULL CHECK(start_block>=0 AND start_block<=end_block),end_hash text NOT NULL,block_time text NOT NULL,
  PRIMARY KEY(index_key,end_block),CHECK(end_block-start_block<100));
CREATE TABLE IF NOT EXISTS foundry.market_windows(
  index_key text NOT NULL,token text NOT NULL,end_block bigint NOT NULL,data_json jsonb NOT NULL,
  PRIMARY KEY(index_key,token,end_block),FOREIGN KEY(index_key,end_block) REFERENCES foundry.market_chunks(index_key,end_block) ON DELETE CASCADE);
-- Supabase browser roles have no grants/policies. The backend database owner accesses tables.
DO $$ DECLARE t text; r text; BEGIN
  FOREACH t IN ARRAY ARRAY['schema_migrations','studio_profiles','studio_revisions','market_indexes','market_chunks','market_windows'] LOOP
    EXECUTE format('ALTER TABLE foundry.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON foundry.%I FROM PUBLIC',t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
        EXECUTE format('REVOKE ALL ON foundry.%I FROM %I',t,r);
        EXECUTE format('REVOKE ALL ON SCHEMA foundry FROM %I',r);
      END IF;
    END LOOP;
  END LOOP;
END $$;
INSERT INTO foundry.schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
