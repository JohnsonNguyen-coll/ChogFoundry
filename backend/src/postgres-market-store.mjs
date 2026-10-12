import { AppError } from './validation.mjs';
import { buildIndexedMarket } from './indexed-market.mjs';
const headRow=r=>r?{...r,end_block:Number(r.end_block),start_block:Number(r.start_block)}:null;
export class PostgresMarketStore {
  constructor(config,database){this.config=config;this.database=database;this.source=database.provider==='supabase-postgres'?'Canonical RPC event index in Supabase PostgreSQL':'Canonical RPC event index in PostgreSQL test engine';this.key=`${config.chainId}:${config.factoryAddress.toLowerCase()}:${config.finality}`;this.initialized=false;}
  async initialize() {
    if(this.initialized)return;
    await this.database.transaction(async client=>{
      await client.query('INSERT INTO foundry.market_indexes(index_key,config_json) VALUES($1,$2) ON CONFLICT DO NOTHING',[this.key,JSON.stringify(this.config)]);
      const row=(await client.query('SELECT config_json=$2::jsonb AS matches FROM foundry.market_indexes WHERE index_key=$1',[this.key,JSON.stringify(this.config)])).rows[0];
      if(!row?.matches)throw new AppError(503,'INDEX_CONFIG_CHANGED','The stored index belongs to a different deployment configuration.');
    });this.initialized=true;
  }
  async anchor(value) {
    await this.initialize();
    await this.database.transaction(async client=>{
      const row=(await client.query('SELECT anchor_json,anchor_json=$2::jsonb AS matches FROM foundry.market_indexes WHERE index_key=$1 FOR UPDATE',[this.key,JSON.stringify(value)])).rows[0];
      if(row.anchor_json&&!row.matches)throw new AppError(503,'INDEX_DEPLOYMENT_REORG','The indexed deployment anchor changed.');
      await client.query('UPDATE foundry.market_indexes SET anchor_json=$2 WHERE index_key=$1',[this.key,JSON.stringify(value)]);
    });
  }
  async head(){await this.initialize();return headRow((await this.database.query('SELECT * FROM foundry.market_chunks WHERE index_key=$1 ORDER BY end_block DESC LIMIT 1',[this.key])).rows[0]);}
  async checkpoints(){await this.initialize();return (await this.database.query('SELECT * FROM foundry.market_chunks WHERE index_key=$1 ORDER BY end_block DESC LIMIT 1001',[this.key])).rows.map(headRow);}
  async tokens(){await this.initialize();return (await this.database.query('SELECT DISTINCT token FROM foundry.market_windows WHERE index_key=$1 ORDER BY token',[this.key])).rows.map(r=>r.token);}
  async revision(){await this.initialize();return Number((await this.database.query('SELECT revision FROM foundry.market_indexes WHERE index_key=$1',[this.key])).rows[0].revision);}
  async commit(start,end,block,windows) {
    await this.initialize();
    if(end<start||end-start>=100||block.number!==end)throw new AppError(503,'INDEX_GAP','Invalid index chunk.');
    await this.database.transaction(async client=>{
      await client.query('SELECT index_key FROM foundry.market_indexes WHERE index_key=$1 FOR UPDATE',[this.key]);
      const head=headRow((await client.query('SELECT * FROM foundry.market_chunks WHERE index_key=$1 ORDER BY end_block DESC LIMIT 1',[this.key])).rows[0]);
      if(start!==(head?head.end_block+1:this.config.deploymentBlock))throw new AppError(503,'INDEX_GAP','Concurrent or noncontiguous index chunk. Resynchronize.');
      await client.query('INSERT INTO foundry.market_chunks(index_key,end_block,start_block,end_hash,block_time) VALUES($1,$2,$3,$4,$5)',[this.key,end,start,block.hash,new Date(block.timestamp*1000).toISOString()]);
      for(const data of windows)await client.query('INSERT INTO foundry.market_windows(index_key,token,end_block,data_json) VALUES($1,$2,$3,$4)',[this.key,data.token.address.toLowerCase(),end,JSON.stringify(data)]);
      await client.query('UPDATE foundry.market_indexes SET revision=revision+1 WHERE index_key=$1',[this.key]);
    });
  }
  async rollback(end) {
    await this.initialize();
    await this.database.transaction(async client=>{
      await client.query('SELECT index_key FROM foundry.market_indexes WHERE index_key=$1 FOR UPDATE',[this.key]);
      await client.query('DELETE FROM foundry.market_chunks WHERE index_key=$1 AND end_block>$2',[this.key,end]);
      await client.query('UPDATE foundry.market_indexes SET revision=revision+1 WHERE index_key=$1',[this.key]);
    });
  }
  async market(token,interval=60,wallet=null) {
    if(![60,300,900,3600].includes(interval))throw new AppError(400,'INVALID_INTERVAL','Invalid candle interval.');
    await this.initialize();
    return this.database.transaction(async client=>{
      const rows=(await client.query('SELECT data_json FROM foundry.market_windows WHERE index_key=$1 AND token=$2 ORDER BY end_block LIMIT 5001',[this.key,token.toLowerCase()])).rows;
      if(!rows.length)throw new AppError(404,'TOKEN_NOT_INDEXED','No canonical launch for this token has been indexed yet.');
      if(rows.length>5000)throw new AppError(503,'INDEX_QUERY_LIMIT','Market query budget exceeded.');
      const head=headRow((await client.query('SELECT * FROM foundry.market_chunks WHERE index_key=$1 ORDER BY end_block DESC LIMIT 1',[this.key])).rows[0]);
      const revision=Number((await client.query('SELECT revision FROM foundry.market_indexes WHERE index_key=$1',[this.key])).rows[0].revision);
      return buildIndexedMarket(rows.map(r=>r.data_json),head,revision,interval,wallet);
    },{readOnly:true});
  }
  close(){}
}
