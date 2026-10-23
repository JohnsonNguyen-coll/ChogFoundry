export function vercelOutputConfig(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('Set FOUNDRY_API_ORIGIN to the Railway HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw Error('FOUNDRY_API_ORIGIN must be an HTTPS origin without a path, credentials or query.');
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('Use the public Railway HTTPS origin.');
  return { version: 3, routes: [
    { src: '/api', dest: `${url.origin}/api`, headers: { 'Cache-Control': 'no-store' } },
    { src: '/api/(.*)', dest: `${url.origin}/api/$1`, headers: { 'Cache-Control': 'no-store' } },
    { handle: 'filesystem' },
    { src: '/(?:app(?:/.*)?)?', dest: '/index.html', headers: { 'Cache-Control': 'no-store' } },
    { src: '/.*', status: 404 },
  ] };
}
