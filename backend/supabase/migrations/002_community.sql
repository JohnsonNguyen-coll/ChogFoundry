-- Additive, backend-only community state. No seeded accounts, posts, tasks or points.
CREATE TABLE IF NOT EXISTS foundry.club_members(studio_key text NOT NULL,wallet text NOT NULL,joined_at timestamptz NOT NULL DEFAULT now(),following boolean NOT NULL DEFAULT true,PRIMARY KEY(studio_key,wallet));
CREATE TABLE IF NOT EXISTS foundry.club_posts(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,studio_key text NOT NULL,room text NOT NULL,kind text NOT NULL CHECK(kind IN ('message','concept','meme')),author text NOT NULL,title text NOT NULL,content text NOT NULL,image_url text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),hidden boolean NOT NULL DEFAULT false,moderation_json jsonb,proof_json jsonb);
CREATE INDEX IF NOT EXISTS club_posts_recent ON foundry.club_posts(studio_key,room,id DESC);
CREATE INDEX IF NOT EXISTS club_posts_author_rate ON foundry.club_posts(author,created_at DESC);
CREATE TABLE IF NOT EXISTS foundry.club_votes(post_id bigint NOT NULL REFERENCES foundry.club_posts(id),wallet text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(post_id,wallet));
CREATE TABLE IF NOT EXISTS foundry.social_links(wallet text PRIMARY KEY,x_user_id text NOT NULL UNIQUE,username text NOT NULL,linked_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS foundry.engagement_tasks(id uuid PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('follow','like','reply','repost')),target_user_id text NOT NULL,target_post_id text,points integer NOT NULL CHECK(points>0 AND points<=1000000),title text NOT NULL,starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(ends_at>starts_at),CHECK((kind='follow')=(target_post_id IS NULL)));
CREATE TABLE IF NOT EXISTS foundry.engagement_claims(task_id uuid NOT NULL REFERENCES foundry.engagement_tasks(id),x_user_id text NOT NULL,wallet text NOT NULL,action_key text NOT NULL UNIQUE,evidence_json jsonb NOT NULL,verified_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(task_id,x_user_id));
CREATE TABLE IF NOT EXISTS foundry.points_ledger(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,wallet text NOT NULL,delta bigint NOT NULL CHECK(delta<>0),kind text NOT NULL CHECK(kind IN ('engagement','raffle-entry','raffle-refund')),reference text NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS points_wallet ON foundry.points_ledger(wallet,id DESC);
CREATE TABLE IF NOT EXISTS foundry.campaigns(id uuid PRIMARY KEY,title text NOT NULL,rules text NOT NULL,prize_token_id text NOT NULL,entry_points integer NOT NULL CHECK(entry_points>0),max_entries integer NOT NULL CHECK(max_entries>0 AND max_entries<=5000),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,status text NOT NULL CHECK(status IN ('draft','open','frozen','cancelled')),created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),onchain_id text NOT NULL UNIQUE,manifest_json jsonb,chain_evidence jsonb,CHECK(ends_at>starts_at));
CREATE TABLE IF NOT EXISTS foundry.campaign_entries(campaign_id uuid NOT NULL REFERENCES foundry.campaigns(id),wallet text NOT NULL,x_user_id text NOT NULL,points_spent integer NOT NULL,entered_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(campaign_id,wallet),UNIQUE(campaign_id,x_user_id));
CREATE TABLE IF NOT EXISTS foundry.treasury_policy(id integer PRIMARY KEY CHECK(id=1),operating_raw text NOT NULL,buyback_raw text NOT NULL,max_nft_price_raw text NOT NULL,author text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS foundry.treasury_receipts(transaction_hash text PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('platform-claim','buyback','giveaway')),evidence_json jsonb NOT NULL,submitted_by text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS foundry.agent_runs(id uuid PRIMARY KEY,wallet text NOT NULL,studio_key text NOT NULL,prompt text NOT NULL,response text NOT NULL,model text NOT NULL,sources_json jsonb NOT NULL,usage_json jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS foundry.agent_requests(id uuid PRIMARY KEY,wallet text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS agent_requests_quota ON foundry.agent_requests(wallet,created_at DESC);
DO $$ DECLARE t text; r text; BEGIN
FOREACH t IN ARRAY ARRAY['club_members','club_posts','club_votes','social_links','engagement_tasks','engagement_claims','points_ledger','campaigns','campaign_entries','treasury_policy','treasury_receipts','agent_runs','agent_requests'] LOOP
 EXECUTE format('ALTER TABLE foundry.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON foundry.%I FROM PUBLIC',t);
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON foundry.%I FROM %I',t,r); END IF;
 END LOOP;
END LOOP;
END $$;
INSERT INTO foundry.schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
