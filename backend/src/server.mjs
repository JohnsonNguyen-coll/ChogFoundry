import { communityApi } from './community-api.mjs';
import { PUBLIC_WS_RPCS, sharedRpcPool } from './rpc-pool.mjs';
import { createFrontendHost } from './frontend-host.mjs';
import { transactionHash } from './launch-receipt.mjs';
import { launchInput } from './launch-data.mjs';
import { actionWallet } from './fee-actions.mjs';
import { preflightInput } from './trade-preflight.mjs';
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
export function createApi({ databasePath, marketDatabasePath, origin, frontendDirectory } = {}) {
  const frontend = frontendDirectory ? createFrontendHost(frontendDirectory) : null;
  const reader = new ChainReader();
  // Explicit local database paths remain for legacy storage tests/import; runtime uses Supabase.
  const database=databasePath===undefined?new PostgresDatabase():null;
  const store=database?new PostgresStudioStore(database):new StudioStore(databasePath);
  const auth = new AuthService(reader, origin);
  const factoryAddress=process.env.FOUNDRY_FACTORY_ADDRESS;
  const deploymentBlock=process.env.FOUNDRY_DEPLOYMENT_BLOCK;
  const indexer=factoryAddress&&deploymentBlock?new MarketIndexer(reader.provider,{chainId:chain.id,factoryAddress,deploymentBlock:boundedBlock(deploymentBlock),collection:chain.collection,quote:chain.quote},{databasePath:marketDatabasePath,wsUrl:[...PUBLIC_WS_RPCS,...(process.env.ALCHEMY_WS_URL?[process.env.ALCHEMY_WS_URL]:[])],storeFactory:database?config=>new PostgresMarketStore(config,database):undefined}):null;
  const community=communityApi({reader,database,auth,indexer,profileStore:store,body});
  const streams=new Set();
  indexer?.start();
  const key = id => `${chain.id}:${chain.collection.toLowerCase()}:${id}`;
  const server = http.createServer(async (req, res) => {
    if (frontend && await frontend(req, res)) return;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost'); const route = url.pathname;
      if(await community(req,res,url,send))return;
      if(route==='/api/rpc'&&req.method==='POST'){
        auth.checkOrigin(req);
        return send(200,await sharedRpcPool().request(await body(req)));
      }
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
      if (route === '/api/config') return send(200, { chainId: chain.id, collection: { key: chain.collectionKey, address: chain.collection, name: chain.collectionName, source: chain.collectionSource, temporary: chain.temporaryCollection }, quote: { address: chain.quote, symbol: 'CHOG' }, policy: 'Configured identity only; this response does not certify a deployment. Collection changes require separate contracts and do not migrate existing studios, tokens or fees.' });
      if (route === '/api/execution') {
        const blockers=[];
        if(process.env.FOUNDRY_WALLET_EXECUTION!=='true')blockers.push('WALLET_EXECUTION_NOT_CONFIGURED');
        if(!database?.configured)blockers.push('SUPABASE_NOT_CONFIGURED');
        if(!indexer)blockers.push('DEPLOYMENT_NOT_CONFIGURED');
        const index=indexer?.status()??null;
        let deployment=null;
        if(!blockers.length){
          const migrations=await database.query('SELECT version FROM foundry.schema_migrations WHERE version IN (1,2)');
          if(migrations.rows.length!==2)blockers.push('DATABASE_MIGRATIONS_REQUIRED');
          else deployment=await reader.executionDeployment(factoryAddress,boundedBlock(deploymentBlock));
        }
        return send(200,{chainId:chain.id,network:chain.name,walletExecutionAvailable:blockers.length===0,blockers,factory:factoryAddress||null,index,deployment,backendBroadcasts:false});
      }
      if (route === '/api/session') return send(200, { session: auth.public(auth.session(req)) });
      if (route === '/api/studios') return send(200, { profiles: await store.list(`${chain.id}:${chain.collection.toLowerCase()}:`), source: database?'Supabase PostgreSQL studio profiles; no onchain launches implied.':'Local persisted studio profiles; no onchain launches implied.' });
      if (route === '/api/overview') return send(200, await reader.overview());
      const launchReceiptRoute=route.match(/^\/api\/studios\/([^/]+)\/launch-receipt$/);
      if(launchReceiptRoute)return send(200,await reader.launchReceipt(tokenId(launchReceiptRoute[1]),transactionHash(url.searchParams.get('transactionHash'))));
      const launchRoute=route.match(/^\/api\/studios\/([^/]+)\/(launch-preflight|launch-approval)$/);
      if(launchRoute){
        const input=launchInput({nftId:launchRoute[1],wallet:url.searchParams.get('wallet'),name:url.searchParams.get('name'),symbol:url.searchParams.get('symbol'),initialQuoteIn:url.searchParams.get('initialQuoteIn'),minTokenOut:url.searchParams.get('minTokenOut'),deadline:url.searchParams.get('deadline')});
        return send(200,await reader.launchPreflight(input,launchRoute[2]==='launch-approval'));
      }
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
      const studioTokensRoute=route.match(/^\/api\/studios\/([^/]+)\/tokens$/);
      if(studioTokensRoute){
        const id=String(tokenId(studioTokensRoute[1]));
        if(!indexer)throw new AppError(503,'FOUNDRY_INDEX_NOT_CONFIGURED','The token directory is not configured.');
        await indexer.sync();
        return send(200,{assets:(await indexer.store.assets()).filter(a=>String(a.launch.nftId)===id),index:indexer.status()});
      }
      if(route==='/api/tokens') {
        if(!indexer) throw new AppError(503,'FOUNDRY_INDEX_NOT_CONFIGURED','The market index deployment is not configured.');
        await indexer.sync();return send(200,{tokens:await indexer.store.tokens(),assets:await indexer.store.assets(),index:indexer.status()});
      }
      const walletHistoryRoute=route.match(/^\/api\/tokens\/([^/]+)\/wallet-history$/);
      if(walletHistoryRoute){
        const token=address(walletHistoryRoute[1]),wallet=actionWallet(url.searchParams.get('wallet'));
        if(!indexer)throw new AppError(503,'FOUNDRY_INDEX_NOT_CONFIGURED','The market index deployment is not configured.');
        return send(200,await indexer.walletHistory(token,wallet));
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
      const tradeRoute=route.match(/^\/api\/tokens\/([^/]+)\/(quote|account|preflight|approval|claim-preflight)$/);
      if(tradeRoute){
        const token=address(tradeRoute[1]);
        const wallet=url.searchParams.has('wallet')?address(url.searchParams.get('wallet')):null;
        if(['approval','claim-preflight'].includes(tradeRoute[2])){
          actionWallet(wallet);
          const kind=tradeRoute[2]==='approval'?'approval':'claim';
          const input=kind==='approval'?tradeInput(url.searchParams.get('side'),url.searchParams.get('amountRaw'),wallet):null;
          return send(200,await reader.feeAction(token,wallet,kind,input));
        }
        if(tradeRoute[2]==='preflight'){
          const input=preflightInput({side:url.searchParams.get('side'),amountRaw:url.searchParams.get('amountRaw'),wallet,minOutputRaw:url.searchParams.get('minOutputRaw'),deadline:url.searchParams.get('deadline')});
          return send(200,await reader.tradeState(token,wallet,input,true));
        }
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
      const portfolioRoute=route.match(/^\/api\/wallets\/([^/]+)\/portfolio$/);
      if(portfolioRoute){
        const wallet=actionWallet(portfolioRoute[1]);
        if(!indexer)throw new AppError(503,'FOUNDRY_INDEX_NOT_CONFIGURED','The portfolio deployment index is not configured.');
        return send(200,await indexer.portfolio(wallet));
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
