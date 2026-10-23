import { randomBytes, randomUUID } from "node:crypto";
import {EventEmitter} from 'node:events';
import {openClubStream} from './club-stream.mjs';
import { AppError, tokenId, address } from "./validation.mjs";
import { chain } from "./config.mjs";
import { CommunityStore } from "./community-store.mjs";
import { XEngagement } from "./x-engagement.mjs";
import {
  uuid,
  room,
  text,
  postInput,
  taskInput,
  campaignInput,
  integer,
  postIdentifier,
} from "./community-validation.mjs";
import { agentConfiguration, askClaude } from "./claude-agent.mjs";
import {agentTask,compactAgentContext} from './agent-context.mjs';
import {
  readTreasury,
  treasuryAddress,
  verifyTreasuryReceipt,
} from "./treasury.mjs";
import { raffleAddress, raffleState, raffleCalldata } from "./raffle-chain.mjs";
import { buildManifest } from "./raffle-manifest.mjs";
import { transactionHash } from "./launch-receipt.mjs";
const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};
export function communityApi({
  reader,
  database,
  auth,
  indexer,
  profileStore,
  body,
  streams=new Set(),
}) {
  const store = database ? new CommunityStore(database) : null,
    x = new XEngagement(),
    agentActive = new Set();
  let agentTotal = 0;
  const clubEvents=new EventEmitter();clubEvents.setMaxListeners(16);
  const key = (id) => `${chain.id}:${chain.collection.toLowerCase()}:${id}`;
  function requireDb() {
    if (!store)
      fail(
        503,
        "COMMUNITY_STORAGE_REQUIRED",
        "Community features require the primary Supabase database.",
      );
    if (!database.configured)
      fail(
        503,
        "SUPABASE_NOT_CONFIGURED",
        "Configure Supabase and apply community migration 2.",
      );
  }
  function admin(session) {
    if (session.wallet.toLowerCase() !== treasuryAddress().toLowerCase())
      fail(
        403,
        "PLATFORM_ADMIN_REQUIRED",
        "The configured deployer/treasury wallet is required.",
      );
  }
  async function liveRoom(id, selected) {
    if (selected.startsWith("token:")) {
      const market = await reader.market(address(selected.slice(6)));
      if (String(market.launch.nftId) !== String(id))
        fail(
          403,
          "TOKEN_ROOM_MISMATCH",
          "This token does not belong to this studio.",
        );
    }
  }
  return async (req, res, url, send) => {
    const route = url.pathname;
    if (
      !/^\/api\/(community|clubs|agent|campaigns|engagement|points|treasury|x)(?:\/|$)/.test(
        route,
      )
    )
      return false;
    const get = req.method === "GET",
      write = ["POST", "PUT"].includes(req.method);
    if (!get && !write)
      fail(405, "METHOD_NOT_ALLOWED", "This community method is unsupported.");
    let session = auth.session(req);
    if (write) {
      auth.checkOrigin(req);
      session = auth.session(req, true);
    }
    const finish = (result) => {
      send(200, result);
      return true;
    };
    if (route === "/api/community" && get)
      return finish({
        storageConfigured: !!database?.configured,
        agent: agentConfiguration(),
        xConfigured: x.configured(),
        targetX: "https://x.com/ChogNFT",
        raffleConfigured: chain.raffleEscrowSupported && !!process.env.FOUNDRY_RAFFLE_ADDRESS,
        raffleEscrowSupported: chain.raffleEscrowSupported,
        campaignsEnabled:
          chain.raffleEscrowSupported && process.env.FOUNDRY_CAMPAIGNS_ENABLED === "true" &&
          !!database?.configured,
        admin:
          !!session &&
          !!process.env.FOUNDRY_DEPLOYER_ADDRESS &&
          session.wallet.toLowerCase() ===
            process.env.FOUNDRY_DEPLOYER_ADDRESS.toLowerCase(),
        pointsPolicy:
          "Free verified X engagement only. Points cannot be bought, transferred or earned from trade volume. One linked X account per wallet; this is not proof of one person.",
      });
    requireDb();
    const clubStream=route.match(/^\/api\/clubs\/([^/]+)\/stream$/);
    if(clubStream&&get){
      const id=tokenId(clubStream[1]),selected=room(url.searchParams.get('room')||'lounge');
      await liveRoom(id,selected);await reader.studio(id);
      if(!res.destroyed)openClubStream(req,res,clubEvents,key(id),selected,streams);
      return true;
    }
    if (route === "/api/clubs" && get) {
      const result = await database.query(
        "SELECT token_id,profile_json,created_by FROM foundry.studio_profiles WHERE left(studio_key,length($1))=$1 ORDER BY updated_at DESC LIMIT 50",
        [`${chain.id}:${chain.collection.toLowerCase()}:`],
      );
      return finish({
        studios: result.rows.map((r) => ({
          id: r.token_id,
          name: r.profile_json.name,
          createdBy: r.created_by,
        })),
        scope: "Published studio profiles; no seeded clubs.",
      });
    }
    const club = route.match(
      /^\/api\/clubs\/([^/]+)(?:\/(membership|posts|votes|moderation))?$/,
    );
    if (club) {
      const id = tokenId(club[1]),
        studioKey = key(id),
        op = club[2];
      if (get && !op) {
        const selected = room(url.searchParams.get("room") || "lounge"),
          before = url.searchParams.get("before");
        if (before != null) postIdentifier(before);
        await liveRoom(id, selected);
        const studio = await reader.studio(id);
        const state=await store.club(studioKey, selected, session?.wallet, before);
        const ownerAccess=!!session&&session.wallet.toLowerCase()===studio.nft.owner.toLowerCase();
        return finish({
          studio,
          room: selected,
          ...state,
          membership:{...state.membership,role:ownerAccess?'owner':state.membership?.following?'member':'visitor',canPost:ownerAccess||!!state.membership?.following},
          policy:
            "Public wallet-authenticated chat. No token purchase required. Polling replaces the current 100-post window; proposals never execute contracts. Moderation is owner-only with fresh Transfer-based authorization.",
        });
      }
      if (write && op === "membership") {
        const input = await body(req);
        if (typeof input.following !== "boolean")
          fail(400, "INVALID_MEMBERSHIP", "Choose follow or unfollow.");
        await reader.studio(id);
        auth.session(req, true);
        const result=await store.follow(studioKey,session.wallet,input.following);
        clubEvents.emit('change',{key:studioKey});return finish(result);
      }
      if (write && op === "posts") {
        const input = postInput(await body(req));
        await liveRoom(id, input.room);
        const proof =
          input.room === "announcements"
            ? await reader.ownerProof(id, session)
            : null;
        const owner=proof?.owner??(await reader.studio(id)).nft.owner;
        auth.session(req, true);
        const result=await store.post(studioKey,session.wallet,input,proof,owner);
        clubEvents.emit('change',{key:studioKey,room:input.room,post:result.post});return finish(result);
      }
      if (write && op === "votes") {
        const input = await body(req);
        const post = postIdentifier(input.postId);
        if (typeof input.active !== "boolean")
          fail(400, "INVALID_VOTE", "Choose an explicit vote state.");
        const owner=(await reader.studio(id)).nft.owner;
        auth.session(req, true);
        const result=await store.vote(studioKey,post,session.wallet,input.active,owner);
        clubEvents.emit('change',{key:studioKey});return finish(result);
      }
      if (write && op === "moderation") {
        const input = await body(req),
          post = postIdentifier(input.postId),
          reason = text(input.reason, 500),
          proof = await reader.ownerProof(id, session);
        auth.session(req, true);
        const result=await store.moderate(studioKey,post,session.wallet,reason,proof);
        clubEvents.emit('change',{key:studioKey});return finish(result);
      }
    }
    const agent = route.match(/^\/api\/agent\/([^/]+)$/);
    if (agent) {
      const id = tokenId(agent[1]),
        studioKey = key(id);
      session = auth.session(req, true);
      if (get)
        return finish({
          configuration: agentConfiguration(),
          history: await store.agentHistory(studioKey, session.wallet),
        });
      if (write) {
        if (!agentConfiguration().configured)
          fail(
            503,
            "CLAUDE_NOT_CONFIGURED",
            "Configure ANTHROPIC_API_KEY and CLAUDE_MODEL in backend/.env.",
          );
        const input = await body(req),
          prompt = text(input.prompt, 4000),
          task = agentTask(input.task),
          selectedToken = input.tokenAddress
            ? address(input.tokenAddress)
            : null,
          wallet = session.wallet.toLowerCase();
        if (agentActive.has(wallet) || agentTotal >= 2)
          fail(429, "AGENT_BUSY", "An agent request is already running.");
        const quota = (
          await database.query(
            "SELECT count(*)::text AS count,max(created_at) AS latest FROM foundry.agent_requests WHERE wallet=$1 AND created_at>now()-interval '1 day'",
            [wallet],
          )
        ).rows[0];
        if (Number(quota.count) >= 20)
          fail(
            429,
            "AGENT_DAILY_LIMIT",
            "Daily studio assistant request limit reached.",
          );
        if (quota.latest && Date.parse(quota.latest) > Date.now() - 30000)
          fail(429, "AGENT_RATE_LIMIT", "Wait before asking another question.");
        if (agentActive.has(wallet) || agentTotal >= 2)
          fail(429, "AGENT_BUSY", "An agent request is already running.");
        agentActive.add(wallet);
        agentTotal++;
        try {
          await database.query(
            "INSERT INTO foundry.agent_requests(id,wallet) VALUES($1,$2)",
            [randomUUID(), wallet],
          );
          const [studio,profile,club]=await Promise.all([reader.studio(id),profileStore.get(studioKey),task==='community'?store.club(studioKey,"lounge",wallet):null]);
          let market=null;
          if (selectedToken) {
            market = await reader.market(selectedToken);
            if (String(market.launch.nftId) !== String(id))
              fail(
                403,
                "TOKEN_STUDIO_MISMATCH",
                "The selected token belongs to another studio.",
              );
          }
          const context=compactAgentContext({task,studio,profile,club,market});
          const result = await askClaude(prompt, context);
          auth.session(req, true);
          await store.agentRun(studioKey, wallet, prompt, result);
          return finish(result);
        } finally {
          agentActive.delete(wallet);
          agentTotal--;
        }
      }
    }
    if (route === "/api/x/start" && write) {
      await body(req);
      return finish(x.start(session.wallet, auth.token(req)));
    }
    if (route === "/api/x/finish" && write) {
      const input = await body(req);
      const result = await x.finish(
        session.wallet,
        auth.token(req),
        input.state,
        input.code,
        store,
        () => auth.session(req, true),
      );
      auth.session(req, true);
      return finish(result);
    }
    if (route === "/api/points" && get) {
      session = auth.session(req, true);
      return finish(await store.points(session.wallet));
    }
    if (route === "/api/engagement/tasks") {
      if (get) {
        const tasks = await store.tasks();
        return finish({
          tasks: tasks.slice(0, 100),
          truncated: tasks.length > 100,
          limit: 100,
          target: "https://x.com/ChogNFT",
        });
      }
      if (write) {
        admin(session);
        const input = taskInput(await body(req)),
          target = await x.target(session.wallet, input.targetPostId);
        auth.session(req, true);
        return finish(await store.createTask(input, target, session.wallet));
      }
    }
    const task = route.match(/^\/api\/engagement\/tasks\/([^/]+)\/verify$/);
    if (task && write) {
      const input = await body(req),
        id = uuid(task[1]),
        taskRow = await store.task(id),
        link = await store.socialLink(session.wallet);
      if (!link)
        fail(
          403,
          "X_LINK_REQUIRED",
          "Link your X account before verifying engagement.",
        );
      const evidence = await x.verify(session.wallet, taskRow, input.replyId);
      if (evidence.xUserId !== link.x_user_id)
        fail(
          409,
          "X_LINK_CHANGED",
          "The verified X account differs from the wallet link.",
        );
      auth.session(req, true);
      return finish(
        await store.credit(session.wallet, id, link.x_user_id, evidence),
      );
    }
    if (route === "/api/campaigns") {
      if (get) {
        const campaigns = await store.campaigns();
        return finish({
          campaigns: campaigns.slice(0, 100),
          truncated: campaigns.length > 100,
          limit: 100,
          policy:
            "One NFT prize and one entry per linked wallet/X account per campaign. Entry spends earned points, never tokens or trading volume. Rules and point price are immutable after draft creation. Drafts are not live raffles.",
        });
      }
      if (write) {
        admin(session);
        const input = campaignInput(await body(req));
        return finish(
          await store.createCampaign(
            input,
            session.wallet,
            "0x" + randomBytes(32).toString("hex"),
          ),
        );
      }
    }
    const campaign = route.match(
      /^\/api\/campaigns\/([^/]+)(?:\/(publish|enter|freeze|manifest|state|prepare|refund))?$/,
    );
    if (campaign) {
      const id = uuid(campaign[1]),
        op = campaign[2],
        c = await store.campaign(id);
      if (get && !op) return finish({ campaign: c });
      if (get && op === "manifest") {
        if (!c.manifest_json)
          fail(404, "MANIFEST_NOT_FROZEN", "The list has not been frozen.");
        return finish(c.manifest_json);
      }
      if (get && op === "state") return finish(await raffleState(reader, c));
      if (write && op === "publish") {
        admin(session);
        await body(req);
        if (process.env.FOUNDRY_CAMPAIGNS_ENABLED !== "true")
          fail(
            503,
            "CAMPAIGNS_NOT_ENABLED",
            "Actual campaign publication has not been enabled.",
          );
        const proof = await raffleState(reader, c);
        if (!proof.state.exists || proof.state.cancelled || proof.state.ready)
          fail(
            409,
            "PRIZE_NOT_ESCROWED",
            "Escrow the declared NFT with matching onchain rules first.",
          );
        auth.session(req, true);
        return finish(await store.openCampaign(id, proof));
      }
      if (write && op === "enter") {
        await body(req);
        if (process.env.FOUNDRY_CAMPAIGNS_ENABLED !== "true")
          fail(
            503,
            "CAMPAIGNS_NOT_ENABLED",
            "Campaign entries are not enabled.",
          );
        const proof = await raffleState(reader, c);
        if (
          !proof.state.exists ||
          proof.state.cancelled ||
          proof.state.ready ||
          proof.state.root !== "0x" + "0".repeat(64)
        )
          fail(
            409,
            "RAFFLE_CLOSED",
            "Prize custody or entry state is no longer valid.",
          );
        auth.session(req, true);
        return finish(await store.enter(id, session.wallet));
      }
      if (write && op === "freeze") {
        admin(session);
        await body(req);
        const proof = await raffleState(reader, c);
        if (!proof.state.exists || proof.state.cancelled)
          fail(409, "RAFFLE_CLOSED", "The onchain campaign is unavailable.");
        auth.session(req, true);
        return finish(
          await store.freeze(id, (row, entries) =>
            buildManifest(row, entries, raffleAddress()),
          ),
        );
      }
      if (write && op === "refund") {
        admin(session);
        await body(req);
        const proof = await raffleState(reader, c);
        if (!proof.state.cancelled)
          fail(
            409,
            "CANCELLATION_NOT_FINALIZED",
            "Canonical onchain cancellation is required before refunding points.",
          );
        auth.session(req, true);
        return finish(await store.refund(id, proof));
      }
      if (write && op === "prepare") {
        admin(session);
        const input = await body(req),
          proof = await raffleState(reader, c);
        const tx = raffleCalldata(
          c,
          proof.state,
          input.action,
          session.wallet,
          input.seed,
        );
        auth.session(req, true);
        const tag = "0x" + proof.provenance.blockNumber.toString(16);
        const result = await reader.provider.send("eth_call", [
          { from: tx.from, to: tx.to, data: tx.data, value: tx.value },
          tag,
        ]);
        const gas = await reader.provider.send("eth_estimateGas", [
          { from: tx.from, to: tx.to, data: tx.data, value: tx.value },
          tag,
        ]);
        if (
          (await reader.provider.getBlock(proof.provenance.blockNumber))
            ?.hash !== proof.provenance.blockHash
        )
          fail(503, "CHAIN_REORG", "Raffle preparation snapshot changed.");
        return finish({
          status: "simulated",
          action: input.action,
          campaignId: id,
          collection: chain.collection,
          transaction: tx,
          gasEstimateRaw: String(BigInt(gas)),
          simulationResult: result,
          ...proof,
          executionEnabled: false,
          policy:
            "Unsigned exact action only; draw value is the current native MON provider fee, paid by the organizer. No transaction is submitted.",
        });
      }
    }
    if (route === "/api/treasury" && get)
      return finish(await readTreasury(reader, store));
    if (route === "/api/treasury/receipts" && write) {
      admin(session);
      const input = await body(req),
        hash = transactionHash(input.transactionHash);
      const proof = await reader.snapshot(
        async (block) => ({
          evidence: await verifyTreasuryReceipt(
            reader,
            hash,
            input.kind,
            block,
          ),
        }),
        "finalized",
      );
      auth.session(req, true);
      await store.receipt(hash, input.kind, proof.evidence, session.wallet);
      return finish(proof);
    }
    if (route === "/api/treasury/policy" && write) {
      admin(session);
      const input = await body(req);
      for (const k of ["operatingRaw", "buybackRaw", "maxNftPriceRaw"])
        input[k] = String(tokenId(input[k]));
      const treasury = await readTreasury(reader, store);
      if (
        BigInt(input.operatingRaw) + BigInt(input.buybackRaw) >
          BigInt(treasury.budgetCeilingRaw) ||
        BigInt(input.maxNftPriceRaw) > BigInt(input.buybackRaw)
      )
        fail(
          422,
          "TREASURY_BUDGET_EXCEEDED",
          "Budget cannot exceed verified collected fees and actual CHOG balance; per-NFT price must fit the buyback budget.",
        );
      auth.session(req, true);
      return finish(await store.setPolicy(input, session.wallet));
    }
    fail(404, "NOT_FOUND", "Community endpoint not found.");
  };
}
