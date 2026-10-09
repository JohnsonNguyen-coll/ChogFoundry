import { AppError } from './validation.mjs';
export function profileInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError(400, 'INVALID_PROFILE', 'A studio profile object is required.');
  const allowed = ['name', 'description', 'website', 'coverUrl', 'expectedRevision'];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new AppError(400, 'UNKNOWN_FIELD', 'Unknown studio profile field.');
  function text(key, max, required = false) {
    if (typeof input[key] !== 'string') throw new AppError(400, 'INVALID_PROFILE', `${key} must be text.`);
    const value = input[key].trim();
    if ((required && !value) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new AppError(400, 'INVALID_PROFILE', `${key} is empty, too long or contains invalid characters.`);
    return value;
  }
  function link(key) {
    const value = text(key, 2048); if (!value) return '';
    try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); return url.href; }
    catch { throw new AppError(400, 'INVALID_URL', `${key} must be an HTTPS URL without credentials.`); }
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new AppError(400, 'INVALID_REVISION', 'An expected profile revision is required.');
  return { name: text('name', 80, true), description: text('description', 2000), website: link('website'), coverUrl: link('coverUrl'), expectedRevision: input.expectedRevision };
}

