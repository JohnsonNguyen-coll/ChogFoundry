import { buildWalletPortfolio } from './wallet-portfolio.mjs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndexedMarket } from './indexed-market.mjs';
import { AppError } from './validation.mjs';

export class MarketStore {
  constructor(config,filename=fileURLToPath(new URL('../data/markets.sqlite',import.meta.url))) {
    if(filename!==':memory:') mkdirSync(path.dirname(filename),{recursive:true});
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS index_config(id INTEGER PRIMARY KEY CHECK(id=1),config_json TEXT NOT NULL,revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS index_anchor(id INTEGER PRIMARY KEY CHECK(id=1),anchor_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS market_chunks(end_block INTEGER PRIMARY KEY,start_block INTEGER NOT NULL,end_hash TEXT NOT NULL,block_time TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS market_windows(token TEXT NOT NULL,end_block INTEGER NOT NULL,data_json TEXT NOT NULL,
        PRIMARY KEY(token,end_block),FOREIGN KEY(end_block) REFERENCES market_chunks(end_block) ON DELETE CASCADE);`);
    const json=JSON.stringify(config), prior=this.db.prepare('SELECT config_json FROM index_config WHERE id=1').get();
    if(prior&&prior.config_json!==json) { this.db.close(); throw new AppError(503,'INDEX_CONFIG_CHANGED','The index database belongs to a different deployment. Use a separate database; do not overwrite it.'); }
    this.db.prepare('INSERT OR IGNORE INTO index_config VALUES(1,?,0)').run(json);
    this.config=config;
  }
  anchor(value) {
    const json=JSON.stringify(value),old=this.db.prepare('SELECT anchor_json FROM index_anchor WHERE id=1').get();
    if(old&&old.anchor_json!==json) throw new AppError(503,'INDEX_DEPLOYMENT_REORG','The indexed deployment anchor changed. Use a separately reviewed deployment database.');
    this.db.prepare('INSERT OR IGNORE INTO index_anchor VALUES(1,?)').run(json);
  }
  head() { return this.db.prepare('SELECT * FROM market_chunks ORDER BY end_block DESC LIMIT 1').get()||null; }
  checkpoints() { return this.db.prepare('SELECT * FROM market_chunks ORDER BY end_block DESC LIMIT 1001').all(); }
  tokens() { return this.db.prepare('SELECT DISTINCT token FROM market_windows ORDER BY token').all().map(r=>r.token); }
  assets() {
    const rows=this.db.prepare('SELECT data_json FROM market_windows w WHERE end_block=(SELECT min(end_block) FROM market_windows WHERE token=w.token) ORDER BY token LIMIT 201').all();
    if(rows.length>200)throw new AppError(503,'INDEX_TOKEN_LIMIT','Token directory exceeds its capacity.');
    return rows.map(r=>{const {token,launch}=JSON.parse(r.data_json);return {token,launch};});
  }
  revision() { return this.db.prepare('SELECT revision FROM index_config WHERE id=1').get().revision; }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try {action();this.db.prepare('UPDATE index_config SET revision=revision+1 WHERE id=1').run();this.db.exec('COMMIT');}
    catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  commit(start,end,block,windows) {
    const expected=this.head()?.end_block+1||this.config.deploymentBlock;
    if(start!==expected||end<start||end-start>=100||block.number!==end) throw new AppError(503,'INDEX_GAP','Indexer chunks must be contiguous and bounded.');
    this.transaction(()=>{
      this.db.prepare('INSERT INTO market_chunks VALUES(?,?,?,?)').run(end,start,block.hash,new Date(block.timestamp*1000).toISOString());
      for(const data of windows) this.db.prepare('INSERT INTO market_windows VALUES(?,?,?)').run(data.token.address.toLowerCase(),end,JSON.stringify(data));
    });
  }
  rollback(end) { this.transaction(()=>this.db.prepare('DELETE FROM market_chunks WHERE end_block>?').run(end)); }
  market(token,intervalSeconds=60,wallet=null) {
    if(![60,300,900,3600].includes(intervalSeconds)) throw new AppError(400,'INVALID_INTERVAL','Invalid candle interval.');
    const rows=this.db.prepare('SELECT data_json FROM market_windows WHERE token=? ORDER BY end_block LIMIT 5001').all(token.toLowerCase());
    if(!rows.length) throw new AppError(404,'TOKEN_NOT_INDEXED','No canonical launch for this token has been indexed yet.');
    if(rows.length>5000) throw new AppError(503,'INDEX_QUERY_LIMIT','This market exceeds the current local query budget.');
    return buildIndexedMarket(rows.map(r=>JSON.parse(r.data_json)),this.head(),this.revision(),intervalSeconds,wallet);
  }

  portfolio(wallet){
    const rows=this.db.prepare('SELECT data_json FROM market_windows ORDER BY token,end_block LIMIT 5001').all();
    return buildWalletPortfolio(rows.map(r=>JSON.parse(r.data_json)),this.head(),this.revision(),wallet);
  }
  close(){this.db.close();}
}
