import { randomBytes, createHash } from 'node:crypto';
import { verifyMessage } from 'ethers';
import { address, AppError } from './validation.mjs';
const challengeTtl = 5 * 60 * 1000;
const sessionTtl = 12 * 60 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');
export class AuthService {
  constructor(reader, origin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173') {
    this.reader = reader; this.origin = new URL(origin).origin;
    this.challenges = new Map(); this.sessions = new Map();
  }
  checkOrigin(req) {
    if (req.headers.origin !== this.origin) throw new AppError(403, 'ORIGIN_REQUIRED', 'This request must come from the configured application origin.');
  }
  prune() {
    for (const map of [this.challenges, this.sessions]) for (const [key, value] of map) if (value.expires <= Date.now()) map.delete(key);
  }
  async challenge(walletInput) {
    this.prune();
    if (this.challenges.size >= 1000) throw new AppError(429, 'AUTH_BUSY', 'Too many pending sign-in requests.');
    const wallet = address(walletInput);
    const { provenance: anchor } = await this.reader.anchor();
    const issued = Date.now(); const expires = issued + challengeTtl;
    const sessionExpires = issued + sessionTtl;
    const challengeId = randomBytes(24).toString('hex');
    const nonce = randomBytes(16).toString('hex');
    const url = new URL(this.origin);
    const message = `${url.host} wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to Chog Foundry. This does not authorize blockchain transactions.\n\nURI: ${this.origin}\nVersion: 1\nChain ID: 143\nNonce: ${nonce}\nIssued At: ${new Date(issued).toISOString()}\nExpiration Time: ${new Date(sessionExpires).toISOString()}`;
    this.challenges.set(challengeId, { wallet, message, anchor, expires, sessionExpires });
    return { challengeId, message, expiresAt: new Date(expires).toISOString(), anchor };
  }
  verify(input) {
    this.prune();
    const challenge = this.challenges.get(input?.challengeId);
    this.challenges.delete(input?.challengeId);
    if (!challenge || challenge.message !== input.message || typeof input.signature !== 'string') throw new AppError(401, 'INVALID_CHALLENGE', 'The sign-in challenge is invalid or expired. Request a new one.');
    let signer;
    try { signer = verifyMessage(challenge.message, input.signature); } catch {}
    if (signer?.toLowerCase() !== challenge.wallet.toLowerCase()) throw new AppError(401, 'INVALID_SIGNATURE', 'The signature does not match this wallet. Contract-wallet signatures are not supported yet.');
    if (this.sessions.size >= 1000) throw new AppError(429, 'AUTH_BUSY', 'Too many active sessions.');
    const token = randomBytes(32).toString('base64url');
    const session = { wallet: challenge.wallet, anchor: challenge.anchor, expires: challenge.sessionExpires };
    this.sessions.set(digest(token), session);
    return { token, session };
  }
  token(req) { return /(?:^|;\s*)foundry_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1]; }
  session(req, required = false) {
    this.prune(); const token = this.token(req); const session = token ? this.sessions.get(digest(token)) : null;
    if (!session && required) throw new AppError(401, 'SIGN_IN_REQUIRED', 'Sign in with your wallet to manage a studio.');
    return session || null;
  }
  public(session) { return session ? { wallet: session.wallet, expiresAt: new Date(session.expires).toISOString() } : null; }
  cookie(token, seconds = sessionTtl / 1000) { return `foundry_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${seconds}${this.origin.startsWith('https:') ? '; Secure' : ''}`; }
  logout(req) { const token = this.token(req); if (token) this.sessions.delete(digest(token)); }
}
