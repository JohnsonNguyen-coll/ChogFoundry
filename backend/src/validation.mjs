import { getAddress } from 'ethers';
export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export function tokenId(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || value.length > 78 || BigInt(value) >= 2n ** 256n) {
    throw new AppError(400, 'INVALID_TOKEN_ID', 'Token ID must be a uint256 integer.');
  }
  return BigInt(value);
}
export function address(value) {
  try { return getAddress(value); } catch { throw new AppError(400, 'INVALID_ADDRESS', 'Invalid wallet address.'); }
}
export function boundedBlock(value) {
  if (!/^(0|[1-9][0-9]*)$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) throw new AppError(400, 'INVALID_BLOCK', 'Invalid block number.');
  return Number(value);
}
