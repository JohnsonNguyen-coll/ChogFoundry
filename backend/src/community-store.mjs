import { randomUUID } from "node:crypto";
import { AppError } from "./validation.mjs";
const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};
const lower = (value) => value.toLowerCase();
export class CommunityStore {
  constructor(database) {
    this.db = database;
  }
  async lock(client, key) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      key,
    ]);
  }
  async club(key, room, wallet, before = null) {
    return this.db.transaction(
      async (c) => {
        const params = [key, room, before];
        const rows = (
          await c.query(
            `SELECT p.*, (SELECT count(*)::text FROM foundry.club_votes v WHERE v.post_id=p.id) AS votes FROM foundry.club_posts p WHERE studio_key=$1 AND room=$2 AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT 101`,
            params,
          )
        ).rows;
        const members = (
          await c.query(
            "SELECT count(*)::text AS count FROM foundry.club_members WHERE studio_key=$1 AND following=true",
            [key],
          )
        ).rows[0].count;
        const membership = wallet
          ? ((
              await c.query(
                "SELECT following,joined_at FROM foundry.club_members WHERE studio_key=$1 AND wallet=$2",
                [key, lower(wallet)],
              )
            ).rows[0] ?? null)
          : null;
        const contributions = (
          await c.query(
            `SELECT author,count(*)::text AS posts FROM foundry.club_posts WHERE studio_key=$1 AND hidden=false GROUP BY author ORDER BY count(*) DESC,author LIMIT 20`,
            [key],
          )
        ).rows;
        return {
          members,
          membership,
          contributions,
          hasOlder: rows.length > 100,
          posts: rows
            .slice(0, 100)
            .reverse()
            .map((p) => ({
              id: String(p.id),
              author: p.author,
              title: p.hidden ? "Moderated post" : p.title,
              content: p.hidden ? "" : p.content,
              imageUrl: p.hidden ? "" : p.image_url,
              kind: p.kind,
              createdAt: p.created_at,
              hidden: p.hidden,
              votes: p.votes,
              moderation: p.moderation_json,
              ownershipEvidence: p.proof_json,
            })),
        };
      },
      { readOnly: true },
    );
  }
  async follow(key, wallet, following) {
    return (
      await this.db.query(
        `INSERT INTO foundry.club_members(studio_key,wallet,following) VALUES($1,$2,$3) ON CONFLICT(studio_key,wallet) DO UPDATE SET following=EXCLUDED.following RETURNING following,joined_at`,
        [key, lower(wallet), following],
      )
    ).rows[0];
  }
  async post(key, wallet, input, proof, currentOwner=null) {
    wallet = lower(wallet);
    return this.db.transaction(async (c) => {
      await this.lock(c, "post:" + wallet);
      if (
        lower(currentOwner||'')!==wallet && !(
          await c.query(
            "SELECT 1 FROM foundry.club_members WHERE studio_key=$1 AND wallet=$2 AND following=true",
            [key, wallet],
          )
        ).rows.length
      )
        fail(403, "JOIN_CLUB_REQUIRED", "Join this club before posting.");
      if (
        Number(
          (
            await c.query(
              "SELECT count(*) FROM foundry.club_posts WHERE author=$1 AND created_at>now()-interval '1 minute'",
              [wallet],
            )
          ).rows[0].count,
        ) >= 10
      )
        fail(429, "POST_RATE_LIMIT", "Wait before posting more messages.");
      const row = (
        await c.query(
          "INSERT INTO foundry.club_posts(studio_key,room,kind,author,title,content,image_url,proof_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
          [
            key,
            input.room,
            input.kind,
            wallet,
            input.title,
            input.content,
            input.imageUrl,
            proof ? JSON.stringify(proof) : null,
          ],
        )
      ).rows[0];
      return { id: String(row.id) };
    });
  }
  async vote(key, id, wallet, active, currentOwner=null) {
    return this.db.transaction(async (c) => {
      const post = (
        await c.query(
          "SELECT kind,hidden FROM foundry.club_posts WHERE id=$1 AND studio_key=$2",
          [id, key],
        )
      ).rows[0];
      if (!post || post.hidden || post.kind === "message")
        fail(404, "PROPOSAL_NOT_FOUND", "This proposal is unavailable.");
      if (
        lower(currentOwner||'')!==lower(wallet) && !(
          await c.query(
            "SELECT 1 FROM foundry.club_members WHERE studio_key=$1 AND wallet=$2 AND following=true",
            [key, lower(wallet)],
          )
        ).rows.length
      )
        fail(403, "JOIN_CLUB_REQUIRED", "Join the club before voting.");
      if (active)
        await c.query(
          "INSERT INTO foundry.club_votes(post_id,wallet) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [id, lower(wallet)],
        );
      else
        await c.query(
          "DELETE FROM foundry.club_votes WHERE post_id=$1 AND wallet=$2",
          [id, lower(wallet)],
        );
      return { active };
    });
  }
  async moderate(key, id, wallet, reason, proof) {
    const r = await this.db.query(
      "UPDATE foundry.club_posts SET hidden=true,moderation_json=$3 WHERE id=$1 AND studio_key=$2 RETURNING id",
      [
        id,
        key,
        JSON.stringify({
          author: wallet,
          reason,
          at: new Date().toISOString(),
          proof,
        }),
      ],
    );
    if (!r.rows.length) fail(404, "POST_NOT_FOUND", "Post not found.");
    return { hidden: true };
  }
  async socialLink(wallet) {
    return (
      (
        await this.db.query(
          "SELECT x_user_id,username,linked_at FROM foundry.social_links WHERE wallet=$1",
          [lower(wallet)],
        )
      ).rows[0] ?? null
    );
  }
  async link(wallet, xUserId, username) {
    return this.db.transaction(async (c) => {
      await this.lock(c, "social-links");
      const existing = (
        await c.query(
          "SELECT * FROM foundry.social_links WHERE wallet=$1 OR x_user_id=$2",
          [lower(wallet), xUserId],
        )
      ).rows;
      if (
        existing.some(
          (r) => r.wallet !== lower(wallet) || r.x_user_id !== xUserId,
        )
      )
        fail(
          409,
          "X_ALREADY_LINKED",
          "This wallet or X account is already linked. Existing points cannot be moved by relinking.",
        );
      await c.query(
        "INSERT INTO foundry.social_links(wallet,x_user_id,username) VALUES($1,$2,$3) ON CONFLICT(wallet) DO UPDATE SET username=EXCLUDED.username",
        [lower(wallet), xUserId, username],
      );
      return { xUserId, username };
    });
  }
  async tasks() {
    return (
      await this.db.query(
        "SELECT * FROM foundry.engagement_tasks ORDER BY created_at DESC LIMIT 101",
      )
    ).rows;
  }
  async task(id) {
    const t = (
      await this.db.query(
        "SELECT * FROM foundry.engagement_tasks WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!t) fail(404, "TASK_NOT_FOUND", "Task not found.");
    return t;
  }
  async createTask(input, targetUserId, author) {
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO foundry.engagement_tasks(id,kind,target_user_id,target_post_id,points,title,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        input.kind,
        targetUserId,
        input.targetPostId,
        input.points,
        input.title,
        input.startsAt,
        input.endsAt,
        lower(author),
      ],
    );
    return this.task(id);
  }
  async points(wallet) {
    wallet = lower(wallet);
    return this.db.transaction(
      async (c) => ({
        balance: (
          await c.query(
            "SELECT coalesce(sum(delta),0)::text AS balance FROM foundry.points_ledger WHERE wallet=$1",
            [wallet],
          )
        ).rows[0].balance,
        ledger: (
          await c.query(
            "SELECT id::text,delta::text,kind,reference,created_at FROM foundry.points_ledger WHERE wallet=$1 ORDER BY id DESC LIMIT 100",
            [wallet],
          )
        ).rows,
        link:
          (
            await c.query(
              "SELECT x_user_id,username,linked_at FROM foundry.social_links WHERE wallet=$1",
              [wallet],
            )
          ).rows[0] ?? null,
      }),
      { readOnly: true },
    );
  }
  async credit(wallet, taskId, xUserId, evidence) {
    wallet = lower(wallet);
    return this.db.transaction(async (c) => {
      await this.lock(c, "points:" + wallet);
      const task = (
        await c.query(
          "SELECT * FROM foundry.engagement_tasks WHERE id=$1 AND starts_at<=now() AND ends_at>now()",
          [taskId],
        )
      ).rows[0];
      if (!task) fail(409, "TASK_CLOSED", "Task is not active.");
      if (
        !(
          await c.query(
            "SELECT 1 FROM foundry.social_links WHERE wallet=$1 AND x_user_id=$2",
            [wallet, xUserId],
          )
        ).rows.length
      )
        fail(
          409,
          "X_LINK_CHANGED",
          "Link this X account to the signed-in wallet.",
        );
      const inserted = await c.query(
        "INSERT INTO foundry.engagement_claims(task_id,x_user_id,wallet,action_key,evidence_json) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING task_id",
        [
          taskId,
          xUserId,
          wallet,
          xUserId +
            ":" +
            task.kind +
            ":" +
            (task.target_post_id || task.target_user_id),
          JSON.stringify(evidence),
        ],
      );
      if (inserted.rows.length)
        await c.query(
          "INSERT INTO foundry.points_ledger(wallet,delta,kind,reference) VALUES($1,$2,'engagement',$3)",
          [wallet, task.points, "task:" + taskId + ":" + xUserId],
        );
      return {
        credited: inserted.rows.length ? task.points : 0,
        alreadyClaimed: !inserted.rows.length,
      };
    });
  }
  async campaigns() {
    return (
      await this.db.query(
        "SELECT c.id,c.title,c.rules,c.prize_token_id,c.entry_points,c.max_entries,c.starts_at,c.ends_at,c.status,c.created_by,c.created_at,c.onchain_id,(SELECT count(*)::text FROM foundry.campaign_entries e WHERE e.campaign_id=c.id) AS entry_count FROM foundry.campaigns c ORDER BY created_at DESC LIMIT 101",
      )
    ).rows;
  }
  async campaign(id) {
    const c = (
      await this.db.query("SELECT * FROM foundry.campaigns WHERE id=$1", [id])
    ).rows[0];
    if (!c) fail(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
    return c;
  }
  async createCampaign(input, author, onchainId) {
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO foundry.campaigns(id,title,rules,prize_token_id,entry_points,max_entries,starts_at,ends_at,status,created_by,onchain_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10)",
      [
        id,
        input.title,
        input.rules,
        input.prizeTokenId,
        input.entryPoints,
        input.maxEntries,
        input.startsAt,
        input.endsAt,
        lower(author),
        onchainId,
      ],
    );
    return this.campaign(id);
  }
  async openCampaign(id, evidence) {
    const row = (
      await this.db.query(
        "UPDATE foundry.campaigns SET status='open',chain_evidence=$2 WHERE id=$1 AND status='draft' AND ends_at>now() RETURNING *",
        [id, JSON.stringify(evidence)],
      )
    ).rows[0];
    if (!row)
      fail(409, "CAMPAIGN_NOT_DRAFT", "Campaign is no longer an active draft.");
    return row;
  }
  async enter(id, wallet) {
    wallet = lower(wallet);
    return this.db.transaction(async (c) => {
      const campaign = (
        await c.query(
          "SELECT * FROM foundry.campaigns WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !campaign ||
        campaign.status !== "open" ||
        Date.parse(campaign.starts_at) > Date.now() ||
        Date.parse(campaign.ends_at) <= Date.now()
      )
        fail(409, "CAMPAIGN_CLOSED", "Campaign is not open.");
      await this.lock(c, "points:" + wallet);
      if (
        (
          await c.query(
            "SELECT 1 FROM foundry.campaign_entries WHERE campaign_id=$1 AND wallet=$2",
            [id, wallet],
          )
        ).rows.length
      )
        fail(409, "ALREADY_ENTERED", "This wallet has already entered.");
      const link = (
        await c.query(
          "SELECT x_user_id FROM foundry.social_links WHERE wallet=$1",
          [wallet],
        )
      ).rows[0];
      if (!link) fail(403, "X_LINK_REQUIRED", "Link your X account first.");
      const count = Number(
        (
          await c.query(
            "SELECT count(*) FROM foundry.campaign_entries WHERE campaign_id=$1",
            [id],
          )
        ).rows[0].count,
      );
      if (count >= campaign.max_entries)
        fail(409, "CAMPAIGN_FULL", "Campaign entry capacity reached.");
      const balance = BigInt(
        (
          await c.query(
            "SELECT coalesce(sum(delta),0)::text AS balance FROM foundry.points_ledger WHERE wallet=$1",
            [wallet],
          )
        ).rows[0].balance,
      );
      if (balance < BigInt(campaign.entry_points))
        fail(
          422,
          "INSUFFICIENT_POINTS",
          "Not enough verified engagement points.",
        );
      await c.query(
        "INSERT INTO foundry.campaign_entries(campaign_id,wallet,x_user_id,points_spent) VALUES($1,$2,$3,$4)",
        [id, wallet, link.x_user_id, campaign.entry_points],
      );
      await c.query(
        "INSERT INTO foundry.points_ledger(wallet,delta,kind,reference) VALUES($1,$2,'raffle-entry',$3)",
        [wallet, -campaign.entry_points, "entry:" + id + ":" + wallet],
      );
      return { entered: true, pointsSpent: campaign.entry_points };
    });
  }
  async freeze(id, build) {
    return this.db.transaction(async (c) => {
      const campaign = (
        await c.query(
          "SELECT * FROM foundry.campaigns WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (
        !campaign ||
        campaign.status !== "open" ||
        Date.parse(campaign.ends_at) > Date.now()
      )
        fail(
          409,
          "CAMPAIGN_NOT_CLOSED",
          "Wait until entries close before freezing the list.",
        );
      const entries = (
        await c.query(
          "SELECT wallet,points_spent,entered_at FROM foundry.campaign_entries WHERE campaign_id=$1 ORDER BY wallet",
          [id],
        )
      ).rows;
      if (!entries.length) fail(409, "EMPTY_CAMPAIGN", "No entries to draw.");
      const manifest = build(campaign, entries);
      await c.query(
        "UPDATE foundry.campaigns SET status='frozen',manifest_json=$2 WHERE id=$1",
        [id, JSON.stringify(manifest)],
      );
      return manifest;
    });
  }
  async refund(id, evidence) {
    return this.db.transaction(async (c) => {
      const campaign = (
        await c.query(
          "SELECT * FROM foundry.campaigns WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!campaign) fail(404, "CAMPAIGN_NOT_FOUND", "Campaign not found.");
      if (campaign.status === "cancelled")
        return { refunded: true, alreadyRefunded: true };
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('points:'||wallet,0)) FROM (SELECT wallet FROM foundry.campaign_entries WHERE campaign_id=$1 ORDER BY wallet) participants",
        [id],
      );
      const refunded = await c.query(
        "WITH refunds AS (INSERT INTO foundry.points_ledger(wallet,delta,kind,reference) SELECT wallet,points_spent,'raffle-refund','refund:'||$1::text||':'||wallet FROM foundry.campaign_entries WHERE campaign_id=$1::uuid ON CONFLICT DO NOTHING RETURNING 1) SELECT count(*)::text AS count FROM refunds",
        [id],
      );
      await c.query(
        "UPDATE foundry.campaigns SET status='cancelled',chain_evidence=$2 WHERE id=$1",
        [id, JSON.stringify(evidence)],
      );
      return { refunded: true, count: Number(refunded.rows[0].count) };
    });
  }
  async policy() {
    return (
      (await this.db.query("SELECT * FROM foundry.treasury_policy WHERE id=1"))
        .rows[0] ?? null
    );
  }
  async setPolicy(input, wallet) {
    await this.db.query(
      "INSERT INTO foundry.treasury_policy(id,operating_raw,buyback_raw,max_nft_price_raw,author) VALUES(1,$1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET operating_raw=EXCLUDED.operating_raw,buyback_raw=EXCLUDED.buyback_raw,max_nft_price_raw=EXCLUDED.max_nft_price_raw,author=EXCLUDED.author,updated_at=now()",
      [
        input.operatingRaw,
        input.buybackRaw,
        input.maxNftPriceRaw,
        lower(wallet),
      ],
    );
    return this.policy();
  }
  async receipts() {
    return (
      await this.db.query(
        "SELECT * FROM foundry.treasury_receipts ORDER BY recorded_at DESC LIMIT 201",
      )
    ).rows;
  }
  async receipt(hash, kind, evidence, wallet) {
    await this.db.query(
      "INSERT INTO foundry.treasury_receipts(transaction_hash,kind,evidence_json,submitted_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [hash, kind, JSON.stringify(evidence), lower(wallet)],
    );
  }
  async agentHistory(key, wallet) {
    return (
      await this.db.query(
        "SELECT id,prompt,response,model,sources_json,usage_json,created_at FROM foundry.agent_runs WHERE studio_key=$1 AND wallet=$2 ORDER BY created_at DESC LIMIT 20",
        [key, lower(wallet)],
      )
    ).rows.reverse();
  }
  async agentRun(key, wallet, prompt, result) {
    await this.db.query(
      "INSERT INTO foundry.agent_runs(id,wallet,studio_key,prompt,response,model,sources_json,usage_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        randomUUID(),
        lower(wallet),
        key,
        prompt,
        result.text,
        result.model,
        JSON.stringify(result.sources),
        JSON.stringify(result.usage),
      ],
    );
  }
}
