export function productionRuntime(env = process.env) {
  let origin;
  try { origin = new URL(env.APP_ORIGIN); }
  catch { throw new Error('Configure APP_ORIGIN as the public frontend origin.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      !['https:', 'http:'].includes(origin.protocol) || (!loopback && origin.protocol !== 'https:'))
    throw new Error('APP_ORIGIN must be an HTTPS origin (HTTP allowed only for loopback).');
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  if (env.SERVE_FRONTEND && !['true', 'false'].includes(env.SERVE_FRONTEND)) throw new Error('SERVE_FRONTEND must be true or false.');
  return { origin: origin.origin, host: env.HOST || '127.0.0.1', port, serveFrontend: env.SERVE_FRONTEND !== 'false' };
}
