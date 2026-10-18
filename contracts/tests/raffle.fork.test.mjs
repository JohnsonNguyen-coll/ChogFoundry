import { prepareRaffleDeployment } from "../scripts/raffle-plan.mjs";
import { reviewedRaffle } from "../../frontend/src/raffle-wallet.mjs";
import {
  submitReviewedTransaction,
  inspectTransaction,
} from "../../frontend/src/wallet-transaction.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  Contract,
  hexlify,
  randomBytes,
  parseEther,
  toBeHex,
  Wallet,
} from "ethers";
import { chain, nftAbi } from "../../backend/src/config.mjs";
import {
  buildManifest,
  rulesHash,
} from "../../backend/src/raffle-manifest.mjs";
import {
  entropyAddress,
  entropyProvider,
} from "../../backend/src/raffle-chain.mjs";
import { withMonadFork } from "./helpers/monad-fork.mjs";

test(
  chain.raffleEscrowSupported ? "real-state raffle escrow, immutable manifest and actual Pyth request; no fabricated oracle fulfillment" : "The Daks transfer validator rejects raffle escrow atomically; no bypass or fake fulfillment",
  { timeout: 180000 },
  async () => {
    await withMonadFork(async ({ local, block }) => {
      const accounts = await local.send("eth_accounts", []);
      accounts[0] = Wallet.createRandom().address;
      assert.equal(await local.getCode(accounts[0]), "0x");
      await local.send("anvil_impersonateAccount", [accounts[0]]);
      await local.send("anvil_setBalance", [
        accounts[0],
        toBeHex(parseEther("100")),
      ]);
      const organizer = await local.getSigner(accounts[0]),
        outsider = await local.getSigner(accounts[1]);
      const compiled = JSON.parse(
          await readFile(
            new URL("../artifacts/contracts.json", import.meta.url),
            "utf8",
          ),
        ),
        a = compiled["src/FoundryRaffle.sol"].FoundryRaffle;
      const plan = await prepareRaffleDeployment(local, accounts[0], {
        localFork: true,
      });
      assert.equal(plan.executionEnabled, false);
      assert.equal(plan.entropy, entropyAddress);
      const deployment = await (
        await organizer.sendTransaction(plan.transaction)
      ).wait();
      assert.equal(deployment.status, 1);
      const raffle = new Contract(plan.creates, a.abi, organizer);
      const nft = new Contract(
          chain.collection,
          [
            ...nftAbi,
            "function transferFrom(address,address,uint256)",
            "function approve(address,uint256)",
          ],
          local,
        ),
        owner = await nft.ownerOf(1557n);
      await local.send("anvil_impersonateAccount", [owner]);
      await local.send("anvil_setBalance", [owner, toBeHex(parseEther("10"))]);
      await (
        await nft
          .connect(await local.getSigner(owner))
          .transferFrom(owner, accounts[0], 1557n)
      ).wait();
      await (await nft.connect(organizer).approve(raffle.target, 1557n)).wait();
      const close = (await local.getBlock("latest")).timestamp + 120,
        id = hexlify(randomBytes(32));
      const c = {
        id: "local-fork-only",
        onchain_id: id,
        title: "Isolated real-state raffle verification",
        rules: "Not a public campaign",
        prize_token_id: "1557",
        entry_points: 1,
        max_entries: 10,
        starts_at: new Date((close - 120) * 1000).toISOString(),
        ends_at: new Date(close * 1000).toISOString(),
      };
      await assert.rejects(
        raffle
          .connect(outsider)
          .create.staticCall(id, 1557n, close, rulesHash(c)),
      );
      if (!chain.raffleEscrowSupported) {
        await assert.rejects(prepareRaffleDeployment(local, accounts[0]), /selected collection rejects/);
        const data = raffle.interface.encodeFunctionData('create', [id, 1557n, close, rulesHash(c)]);
        await assert.rejects(raffle.create.staticCall(id, 1557n, close, rulesHash(c)), error => error.data === '0xe1f1d02e');
        const trace = await local.send('debug_traceCall', [{ from: accounts[0], to: raffle.target, data }, 'latest', { tracer: 'callTracer' }]);
        const validator = await new Contract(chain.collection, ['function getTransferValidator() view returns(address)'], local).getTransferValidator();
        const stack = [trace]; let validatorRejected = false;
        while (stack.length) {
          const call = stack.pop();
          if (call.to?.toLowerCase() === validator.toLowerCase() && call.output?.startsWith('0xe1f1d02e')) validatorRejected = true;
          stack.push(...(call.calls || []));
        }
        assert.equal(validatorRejected, true);
        await assert.rejects(async () => { await (await raffle.create(id, 1557n, close, rulesHash(c), { gasLimit: 2000000 })).wait(); });
        assert.equal(await nft.ownerOf(1557n), accounts[0]);
        assert.equal((await raffle.campaigns(id)).exists, false);
        assert.equal(await raffle.reserved(1557n), false);
        console.log(JSON.stringify({ sourceBlock: block.number, collection: chain.collection, validator, escrowSupported: false, actualEscrowRejectedAtomically: true, oracleRequest: false, mainnetWrites: false }));
        return;
      }
      await (await raffle.create(id, 1557n, close, rulesHash(c))).wait();
      assert.equal(await nft.ownerOf(1557n), raffle.target);
      const snap = await local.send("evm_snapshot", []),
        manifest = buildManifest(
          c,
          accounts.slice(1, 4).map((wallet) => ({ wallet, points_spent: 1 })),
          raffle.target,
          31337,
        );
      await assert.rejects(
        raffle.commit.staticCall(id, manifest.root, 3, manifest.manifestHash),
      );
      await local.send("evm_increaseTime", [121]);
      await local.send("evm_mine", []);
      await (
        await raffle.commit(id, manifest.root, 3, manifest.manifestHash)
      ).wait();
      await assert.rejects(
        raffle.commit.staticCall(id, manifest.root, 3, manifest.manifestHash),
      );
      await assert.rejects(raffle.cancel.staticCall(id));
      await local.send("evm_mine", []);
      const fee = await raffle.drawFee();
      assert.ok(fee > 0n);
      const anchor = await local.getBlock("latest");
      const data = raffle.interface.encodeFunctionData("requestDraw", [
        id,
        hexlify(randomBytes(32)),
      ]);
      const transaction = {
        from: await organizer.getAddress(),
        to: raffle.target,
        chainId: 31337,
        data,
        value: toBeHex(fee),
      };
      const prepared = {
        status: "simulated",
        action: "draw",
        campaignId: id,
        collection: chain.collection,
        transaction,
        gasEstimateRaw: String(await local.estimateGas(transaction)),
        provenance: {
          chainId: 31337,
          blockNumber: anchor.number,
          blockHash: anchor.hash,
          finality: "local-fork-latest",
        },
        state: {
          contract: raffle.target,
          drawFeeRaw: String(fee),
          root: manifest.root,
          manifestHash: manifest.manifestHash,
          rulesHash: rulesHash(c),
          sequence: "0",
        },
      };
      const review = reviewedRaffle(prepared, transaction.from, 31337);
      assert.throws(() =>
        reviewedRaffle(
          {
            ...prepared,
            transaction: { ...transaction, value: toBeHex(fee + 1n) },
          },
          transaction.from,
          31337,
        ),
      );
      const actualWallet = {
        request: async ({ method, params = [] }) => {
          if (method === "eth_accounts") return [await organizer.getAddress()];
          if (method === "eth_sendTransaction")
            return (await organizer.sendTransaction(params[0])).hash;
          return local.send(method, params);
        },
      };
      const submitted = await submitReviewedTransaction(
        actualWallet,
        review,
        review,
        { wallet: transaction.from, chainId: 31337 },
      );
      const receipt = await local.waitForTransaction(submitted.hash, 1, 15000);
      assert.equal(receipt.status, 1);
      assert.equal((await local.getTransaction(submitted.hash)).value, fee);
      await inspectTransaction(
        actualWallet,
        submitted.hash,
        submitted.transaction,
        31337,
      );
      await assert.rejects(
        inspectTransaction(
          actualWallet,
          submitted.hash,
          { ...submitted.transaction, value: toBeHex(fee + 1n) },
          31337,
        ),
      );
      const state = await raffle.campaigns(id);
      assert.ok(state.sequence > 0n);
      assert.equal(state.ready, false);
      assert.equal(state.root, manifest.root);
      await assert.rejects(
        raffle.requestDraw.staticCall(id, hexlify(randomBytes(32)), {
          value: fee,
        }),
      );
      await assert.rejects(
        raffle
          .connect(outsider)
          ._entropyCallback.staticCall(
            state.sequence,
            entropyProvider,
            hexlify(randomBytes(32)),
          ),
      );
      await assert.rejects(
        raffle.claim.staticCall(
          id,
          0,
          manifest.entries[0].wallet,
          manifest.entries[0].proof,
        ),
      );
      // The external provider cannot observe child-fork requests. Never invent a callback/result.
      await local.send("evm_revert", [snap]);
      await (await raffle.cancel(id)).wait();
      assert.equal(
        (await nft.ownerOf(1557n)).toLowerCase(),
        accounts[0].toLowerCase(),
      );
      console.log(
        JSON.stringify({
          sourceBlock: block.number,
          actualNFT: chain.collection,
          actualEntropy: entropyAddress,
          actualRequest: true,
          oracleFulfillment: false,
          mainnetWrites: false,
        }),
      );
    });
  },
);
