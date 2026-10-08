// Local reference model only. No wallet signatures, RPC, storage or real assets.
const BPS = 10_000n;
function uint(value, label = 'amount') {
  if (typeof value !== 'bigint' || value < 0n) throw new Error(`invalid ${label}`);
  return value;
}
function positive(value) { uint(value); if (!value) throw new Error('zero amount'); return value; }
export function splitFee(amount, creatorBps, studioBps) {
  uint(amount); uint(creatorBps); uint(studioBps);
  if (creatorBps + studioBps > BPS) throw new Error('invalid split');
  const creator = amount * creatorBps / BPS;
  const studio = amount * studioBps / BPS;
  return { creator, studio, platform: amount - creator - studio };
}

// The event ingestion/canonicality check is a required external trust boundary.
export class LocalOwnership {
  #studios = new Map();
  #delegates = new Map();
  register(key, owner) {
    if (!key || !owner || this.#studios.has(key)) throw new Error('invalid studio');
    this.#studios.set(key, { owner, epoch: 0, synchronized: true });
  }
  snapshot(key) {
    const state = this.#studios.get(key);
    if (!state || !state.synchronized || !state.owner) throw new Error('ownership unavailable');
    return { ...state };
  }
  setSynchronized(key, synchronized) {
    if (!this.#studios.has(key)) throw new Error('unknown studio');
    this.#studios.get(key).synchronized = Boolean(synchronized);
  }
  transfer(key, from, to) {
    const state = this.snapshot(key);
    if (state.owner !== from || !to) throw new Error('invalid transfer');
    this.#studios.set(key, { ...state, owner: to, epoch: state.epoch + 1 });
  }
  session(key, wallet, expiresAt) {
    const state = this.snapshot(key);
    if (!wallet || !Number.isFinite(expiresAt)) throw new Error('invalid session');
    return Object.freeze({ key, wallet, epoch: state.epoch, expiresAt });
  }
  grant(key, owner, moderator) {
    const state = this.snapshot(key);
    if (owner !== state.owner || !moderator) throw new Error('owner required');
    this.#delegates.set(JSON.stringify([key, moderator]), state.epoch);
  }
  authorize(session, action, now) {
    if (!['launch', 'manage'].includes(action) || !Number.isFinite(now)) throw new Error('invalid action');
    const state = this.snapshot(session.key);
    if (session.epoch !== state.epoch || now >= session.expiresAt) throw new Error('stale session');
    if (session.wallet === state.owner) return true;
    if (action === 'manage' && this.#delegates.get(JSON.stringify([session.key, session.wallet])) === state.epoch) return true;
    throw new Error('owner required');
  }
}

export class FeeBook {
  #launches = new Map();
  #credits = new Map();
  #balance = 0n;
  constructor(ownership, treasury) { this.ownership = ownership; this.treasury = treasury; }
  get liability() { return [...this.#credits.values()].reduce((a, b) => a + b, 0n); }
  get balance() { return this.#balance; }
  creditOf(wallet) { return this.#credits.get(wallet) ?? 0n; }
  register(id, studio, creator, creatorBps, studioBps) {
    splitFee(0n, creatorBps, studioBps);
    if (!id || this.#launches.has(id) || this.ownership.snapshot(studio).owner !== creator) throw new Error('owner required');
    this.#launches.set(id, Object.freeze({ studio, creator, creatorBps, studioBps }));
  }
  accrue(id, amount) {
    positive(amount);
    const launch = this.#launches.get(id);
    if (!launch) throw new Error('unknown launch');
    const owner = this.ownership.snapshot(launch.studio).owner;
    const split = splitFee(amount, launch.creatorBps, launch.studioBps);
    for (const [wallet, credit] of [[launch.creator, split.creator], [owner, split.studio], [this.treasury, split.platform]]) {
      this.#credits.set(wallet, this.creditOf(wallet) + credit);
    }
    this.#balance += amount;
    return Object.freeze({ ...split, studioOwner: owner, creatorWallet: launch.creator });
  }
  claim(wallet) {
    const amount = this.creditOf(wallet);
    if (!amount) throw new Error('nothing to claim');
    this.#credits.set(wallet, 0n);
    this.#balance -= amount;
    return amount;
  }
}

// Discrete linear curve experiment: C(n)=base*n+step*n*(n-1)/2.
// Whole token units, no decimals, no creator allocation. Not proposed tokenomics.
export class CurveExperiment {
  #sold = 0n;
  #reserve = 0n;
  #phase = 'curve';
  constructor({ supply, threshold, base, step, feeBps }) {
    positive(supply); positive(threshold); positive(base); uint(step); uint(feeBps);
    if (threshold >= supply || feeBps >= BPS) throw new Error('invalid curve config');
    this.config = Object.freeze({ supply, threshold, base, step, feeBps });
  }
  get state() { return { sold: this.#sold, reserve: this.#reserve, phase: this.#phase, inventory: this.config.supply - this.#sold }; }
  cumulative(n) { uint(n); return this.config.base * n + this.config.step * n * (n - 1n) / 2n; }
  #active(now, deadline) {
    if (this.#phase !== 'curve') throw new Error('curve closed');
    if (!Number.isFinite(now) || !Number.isFinite(deadline) || now > deadline) throw new Error('deadline exceeded');
  }
  buy(quantity, maxQuote, now, deadline) {
    this.#active(now, deadline); positive(quantity); uint(maxQuote);
    if (this.#sold + quantity > this.config.threshold) throw new Error('threshold exceeded');
    const net = this.cumulative(this.#sold + quantity) - this.cumulative(this.#sold);
    const fee = net * this.config.feeBps / BPS;
    if (net + fee > maxQuote) throw new Error('slippage');
    this.#sold += quantity; this.#reserve += net;
    return { net, fee, paid: net + fee };
  }
  sell(quantity, minQuote, now, deadline) {
    this.#active(now, deadline); positive(quantity); uint(minQuote);
    if (quantity > this.#sold) throw new Error('insufficient sold supply');
    const gross = this.cumulative(this.#sold) - this.cumulative(this.#sold - quantity);
    const fee = gross * this.config.feeBps / BPS;
    if (gross - fee < minQuote) throw new Error('slippage');
    this.#sold -= quantity; this.#reserve -= gross;
    return { gross, fee, received: gross - fee };
  }
  graduate() {
    if (this.#phase !== 'curve' || this.#sold !== this.config.threshold) throw new Error('not ready');
    // Accounting handoff only. No pool, external call, LP or AMM fee capture.
    const migration = Object.freeze({ quote: this.#reserve, tokens: this.config.supply - this.#sold });
    this.#reserve = 0n; this.#phase = 'graduated';
    return migration;
  }
}
