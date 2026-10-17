import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { Wallet } from "ethers";
import { PGlite } from "@electric-sql/pglite";
import { AuthService } from "../src/auth.mjs";
import { ChainReader } from "../src/chain-reader.mjs";
import { PostgresStudioStore } from "../src/postgres-studio-store.mjs";
import { communityApi } from "../src/community-api.mjs";

test(
  "real wallet/RPC club participation without NFTs; announcement and moderation remain owner-only",
  { timeout: 120000 },
  async () => {
    const reader = new ChainReader(),
      engine = new PGlite(),
      origin = "http://127.0.0.1:5173";
    let server;
    try {
      for (const file of ["001_foundry.sql", "002_community.sql"])
        await engine.exec(
          await readFile(
            new URL("../supabase/migrations/" + file, import.meta.url),
            "utf8",
          ),
        );
      // Real PostgreSQL engine only for isolated test storage; the RPC and signatures are real.
      const database = {
          configured: true,
          query: engine.query.bind(engine),
          transaction: engine.transaction.bind(engine),
        },
        auth = new AuthService(reader, origin),
        wallet = Wallet.createRandom();
      const issued = await auth.challenge(wallet.address),
        verified = auth.verify({
          ...issued,
          signature: await wallet.signMessage(issued.message),
        }),
        cookie = "foundry_session=" + verified.token;
      const actualOwner = await reader.nft.ownerOf(1557n);
    assert.equal(await reader.nft.balanceOf(wallet.address),0n);
      assert.notEqual(wallet.address.toLowerCase(), actualOwner.toLowerCase());
      const handler = communityApi({
        reader,
        database,
        auth,
        indexer: null,
        profileStore: new PostgresStudioStore(database),
        body: async (req) => {
          let raw = "";
          for await (const chunk of req) raw += chunk;
          return JSON.parse(raw);
        },
      });
      server = http.createServer(async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        const send = (status, result) => {
          res.writeHead(status);
          res.end(JSON.stringify(result));
        };
        try {
          if (!(await handler(req, res, new URL(req.url, origin), send)))
            send(404, {});
        } catch (e) {
          send(e.status || 500, {
            error: { code: e.code || "FAILED", message: e.message },
          });
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const base = "http://127.0.0.1:" + server.address().port;
      const write = (route, input, signed = true, requestOrigin = origin) =>
        fetch(base + route, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: requestOrigin,
            ...(signed ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify(input),
        });
      assert.equal(
        (await write("/api/clubs/1557/membership", { following: true }, false))
          .status,
        401,
      );
      assert.equal(
        (
          await write(
            "/api/clubs/1557/membership",
            { following: true },
            true,
            "https://wrong.example",
          )
        ).status,
        403,
      );
      assert.equal(
        (await write("/api/clubs/1557/membership", { following: true })).status,
        200,
      );
      const posted = await write("/api/clubs/1557/posts", {
        room: "lounge",
        kind: "message",
        content: "Isolated live-RPC club verification; not runtime content.",
        author: actualOwner,
      });
      assert.equal(posted.status, 200);
      const post = await posted.json();
      const club = await (
        await fetch(base + "/api/clubs/1557", { headers: { Cookie: cookie } })
      ).json();
      assert.equal(club.posts[0].author, wallet.address.toLowerCase());
      assert.equal(club.posts[0].id, post.id);
      assert.equal(club.studio.nft.collection, reader.nft.target);
      const announcement = await write("/api/clubs/1557/posts", {
        room: "announcements",
        content: "Unauthorized announcement",
      });
      assert.equal(announcement.status, 403);
      assert.equal((await announcement.json()).error.code, "OWNER_REQUIRED");
      const moderation = await write("/api/clubs/1557/moderation", {
        postId: post.id,
        reason: "Unauthorized moderation",
      });
      assert.equal(moderation.status, 403);
      assert.equal((await moderation.json()).error.code, "OWNER_REQUIRED");
      const points = await (
        await fetch(base + "/api/points", { headers: { Cookie: cookie } })
      ).json();
      assert.equal(points.balance, "0");
      assert.equal(points.ledger.length, 0);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      reader.close();
      await engine.close();
    }
  },
);
