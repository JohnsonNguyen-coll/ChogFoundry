import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ChainReader } from './chain-reader.mjs';
import { AppError, address, boundedBlock, tokenId } from './validation.mjs';
import { AuthService } from './auth.mjs';
import { StudioStore } from './studio-store.mjs';
import { profileInput } from './profile-validation.mjs';
import { chain } from './config.mjs';
import { MarketIndexer } from './market-indexer.mjs';
import { PostgresDatabase } from './postgres.mjs';
import { PostgresStudioStore } from './postgres-studio-store.mjs';
import { PostgresMarketStore } from './postgres-market-store.mjs';
import { tradeInput } from './trade-data.mjs';
import { openMarketStream } from './market-stream.mjs';

async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new AppError(415, 'JSON_REQUIRED', 'Send an application/json body.');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new AppError(413, 'BODY_TOO_LARGE', 'The request exceeds 16 KB.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new AppError(400, 'INVALID_JSON', 'Invalid JSON object.'); }
}
export function createApi({ databasePath, marketDatabasePath, origin } = {}) {
  const reader = new ChainReader();
  // Explicit local database paths remain for legacy storage tests/import; runtime uses Supabase.
  const database=databasePath===undefined?new PostgresDatabase():null;
  const store=database?new PostgresStudioStore(database):new StudioStore(databasePath);
  const auth = new AuthService(reader, origin);
  const factoryAddress=process.env.FOUNDRY_FACTORY_ADDRESS;
  const deploymentBlock=process.env.FOUNDRY_DEPLOYMENT_BLOCK;
  const indexer=factoryAddress&&deploymentBlock?new MarketIndexer(reader.provider,{chainId:chain.id,factoryAddress,deploymentBlock:boundedBlock(deploymentBlock),collection:chain.collection,quote:chain.quote},{databasePath:marketDatabasePath,storeFactory:database?config=>new PostgresMarketStore(config,database):undefined}):null;
  const streams=new Set();
  indexer?.start();
  const key = id => `${chain.id}:${chain.collection.toLowerCase()}:${id}`;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost'); const route = url.pathname;
      if (route.startsWith('/api/auth/') && req.method === 'POST') {
        auth.checkOrigin(req);
        if (route === '/api/auth/logout') { auth.logout(req); res.setHeader('Set-Cookie', auth.cookie('', 0)); return send(200, { session: null }); }
        const input = await body(req);
        if (route === '/api/auth/challenge') return send(200, await auth.challenge(input.wallet));
        if (route === '/api/auth/verify') {
          const { token, session } = auth.verify(input);
          res.setHeader('Set-Cookie', auth.cookie(token, Math.max(0, Math.floor((session.expires - Date.now()) / 1000))));
          return send(200, { session: auth.public(session) });
        }
      }
      const profileRoute = route.match(/^\/api\/studios\/([^/]+)\/profile$/);
      if (profileRoute && req.method === 'PUT') {
        auth.checkOrigin(req);
        const id = tokenId(profileRoute[1]); const session = auth.session(req, true);
        const input = profileInput(await body(req));
        const proof = await reader.ownerProof(id, session);
        auth.session(req, true);
        return send(200, { profile: await store.save(key(id), id, input, session.wallet, proof) });
      }
      if (req.method !== 'GET') throw new AppError(405, 'METHOD_NOT_ALLOWED', 'This method is not supported for this endpoint.');
      if (route === '/api/health') return send(200, { service: 'Chog Foundry API', mode: 'live-chain-read-only-profiles', storage:{provider:database?'supabase-postgres':'sqlite-explicit-local',configured:database?database.configured:true}, rpcChecked: false });
      if (route === '/api/session') return send(200, { session: auth.public(auth.session(req)) });
      if (route === '/api/studios') return send(200, { profiles: await store.list(), source: database?'Supabase PostgreSQL studio profiles; no onchain launches implied.':'Local persisted studio profiles; no onchain launches implied.' });
      if (route === '/api/overview') return send(200, await reader.overview());
      const nft = route.match(/^\/api\/studios\/([^/]+)(\/(transfers|access))?$/);
      if (nft) {
        const id = tokenId(nft[1]);
        if (!nft[2]) {
          const result = await reader.studio(id);
          result.profile = await store.get(key(id)); result.profileHistory = await store.history(key(id));
          return send(200, result);
        }
        if (nft[3] === 'access') return send(200, { canEdit: true, ...(await reader.ownerProof(id, auth.session(req, true))) });
        const from = url.searchParams.has('fromBlock') ? boundedBlock(url.searchParams.get('fromBlock')) : undefined;
        const to = url.searchParams.has('toBlock') ? boundedBlock(url.searchParams.get('toBlock')) : undefined;
        return send(200, await reader.transfers(id, from, to));
      }
      if(route==='/api/market-index') return send(200,indexer?indexer.status():{configured:false,reason:'A verified factory address and exact deployment block are required.'});
      if(route==='/api/tokens') {
        if(!indexer) throw new AppError(503,'FOUNDRY_INDEX_NOT_CONFIGURED','The market index deployment is not configured.');
        await indexer.sync();return send(200,{tokens:await indexer.store.tokens(),index:indexer.status()});
      }
      const indexedRoute=route.match(/^\/api\/tokens\/([^/]+)\/(history|stream)$/);
      if(indexedRoute) {
        const token=address(indexedRoute[1]);
        const interval=url.searchParams.has('interval')?boundedBlock(url.searchParams.get('interval')):60;
        if(![60,300,900,3600].includes(interval)) throw new AppError(400,'INVALID_INTERVAL','Use a candle interval of 60, 300, 900 or 3600 seconds.');
        if(!indexer) throw new AppError(503,'FOUNDRY_INDEX_NOT_CONFIGURED','The market index deployment is not configured.');
        if(indexedRoute[2]==='history') return send(200,await indexer.market(token,interval));
        return await openMarketStream(req,res,indexer,token,interval,streams);
      }
      const tradeRoute=route.match(/^\/api\/tokens\/([^/]+)\/(quote|account)$/);
      if(tradeRoute){
        const token=address(tradeRoute[1]);
        const wallet=url.searchParams.has('wallet')?address(url.searchParams.get('wallet')):null;
        if(tradeRoute[2]==='quote'){
          const input=tradeInput(url.searchParams.get('side'),url.searchParams.get('amountRaw'),wallet);
          return send(200,await reader.tradeState(token,wallet,input));
        }
        if(!wallet)throw new AppError(400,'WALLET_REQUIRED','Provide a wallet address to inspect account state.');
        return send(200,await reader.tradeState(token,wallet));
      }
      const marketRoute = route.match(/^\/api\/tokens\/([^/]+)\/market$/);
      if (marketRoute) {
        const token = address(marketRoute[1]);
        const from = url.searchParams.has('fromBlock') ? boundedBlock(url.searchParams.get('fromBlock')) : undefined;
        const to = url.searchParams.has('toBlock') ? boundedBlock(url.searchParams.get('toBlock')) : undefined;
        const interval = url.searchParams.has('interval') ? boundedBlock(url.searchParams.get('interval')) : 60;
        if (![60,300,900,3600].includes(interval)) throw new AppError(400, 'INVALID_INTERVAL', 'Use a candle interval of 60, 300, 900 or 3600 seconds.');
        return send(200, await reader.market(token, from, to, interval));
      }
      const wallet = route.match(/^\/api\/wallets\/([^/]+)$/);
      if (wallet) return send(200, await reader.wallet(address(wallet[1])));
      throw new AppError(404, 'NOT_FOUND', 'Endpoint not found.');
    } catch (error) {
      const known = error instanceof AppError;
      if (known && error.status === 429) res.setHeader('Retry-After', '2');
      send(known ? error.status : 500, { error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'Unable to process this request.' } });
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  const closeServer=server.close.bind(server);
  server.close=callback=>{streams.closing=true;for(const stream of streams) stream.end();return closeServer(callback);};
  server.on('close', async () => { await indexer?.close(); reader.close(); await store.close(); await database?.close(); });
  return { server, reader, store, indexer };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createApi();
  const port = Number(process.env.PORT || 3001);
  server.listen(port, '127.0.0.1', () => console.log(`Chog Foundry live API: http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
