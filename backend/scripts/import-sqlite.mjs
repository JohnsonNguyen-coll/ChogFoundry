import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PostgresDatabase } from '../src/postgres.mjs';
import { AppError } from '../src/validation.mjs';

// Stop the API/indexer first. Run a dry run, then --apply; source files are never rewritten.
const apply=process.argv.includes('--apply');
const profilePath=fileURLToPath(new URL('../data/foundry.sqlite',import.meta.url));
const marketPath=fileURLToPath(new URL('../data/markets.sqlite',import.meta.url));
const profiles=existsSync(profilePath)?new DatabaseSync(profilePath,{readOnly:true}):null;
const market=existsSync(marketPath)?new DatabaseSync(marketPath,{readOnly:true}):null;
const database=new PostgresDatabase();
try {
  const counts={profiles:profiles?.prepare('SELECT COUNT(*) AS n FROM studio_profiles').get().n||0,revisions:profiles?.prepare('SELECT COUNT(*) AS n FROM studio_revisions').get().n||0,chunks:market?.prepare('SELECT COUNT(*) AS n FROM market_chunks').get().n||0,windows:market?.prepare('SELECT COUNT(*) AS n FROM market_windows').get().n||0};
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',counts}));
  if(apply) {
    if(!database.configured)throw new AppError(503,'SUPABASE_NOT_CONFIGURED','Configure the destination first.');
    // VACUUM INTO makes a consistent SQLite backup including WAL, without modifying source.
    for(const [db,path] of [[profiles,profilePath],[market,marketPath]]) if(db) db.prepare('VACUUM INTO ?').run(path+'.backup-'+Date.now());
    await database.transaction(async client=>{
      await client.query('LOCK TABLE foundry.studio_profiles,foundry.studio_revisions,foundry.market_indexes,foundry.market_chunks,foundry.market_windows IN ACCESS EXCLUSIVE MODE');
      const occupied=await client.query('SELECT (SELECT COUNT(*) FROM foundry.studio_profiles)+(SELECT COUNT(*) FROM foundry.market_indexes) AS n');
      if(BigInt(occupied.rows[0].n)!==0n) throw new AppError(409,'IMPORT_TARGET_NOT_EMPTY','Import requires an empty Foundry target. Existing cloud data is never overwritten.');
      if(profiles) {
        for(const r of profiles.prepare('SELECT * FROM studio_profiles').all())await client.query('INSERT INTO foundry.studio_profiles VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[r.studio_key,r.token_id,r.profile_json,r.created_by,r.created_at,r.updated_by,r.updated_at,r.revision,r.proof_json]);
        for(const r of profiles.prepare('SELECT * FROM studio_revisions').all())await client.query('INSERT INTO foundry.studio_revisions VALUES($1,$2,$3,$4,$5,$6)',[r.studio_key,r.revision,r.author,r.profile_json,r.saved_at,r.proof_json]);
      }
      if(market) {
        const cfg=market.prepare('SELECT * FROM index_config WHERE id=1').get();
        if(cfg){
          const c=JSON.parse(cfg.config_json);
          if(c.chainId!==143||c.finality!=='finalized')throw new AppError(400,'IMPORT_FORK_REJECTED','Local fork state cannot be imported as production data.');
          const key=`${c.chainId}:${c.factoryAddress.toLowerCase()}:${c.finality}`,anchor=market.prepare('SELECT anchor_json FROM index_anchor WHERE id=1').get()?.anchor_json||null;
          await client.query('INSERT INTO foundry.market_indexes(index_key,config_json,anchor_json,revision) VALUES($1,$2,$3,$4)',[key,cfg.config_json,anchor,cfg.revision]);
          for(const r of market.prepare('SELECT * FROM market_chunks ORDER BY end_block').all())await client.query('INSERT INTO foundry.market_chunks VALUES($1,$2,$3,$4,$5)',[key,r.end_block,r.start_block,r.end_hash,r.block_time]);
          for(const r of market.prepare('SELECT * FROM market_windows ORDER BY end_block').all())await client.query('INSERT INTO foundry.market_windows VALUES($1,$2,$3,$4)',[key,r.token,r.end_block,r.data_json]);
        }
      }
    });
    console.log('SQLite data imported atomically. Local files and backups preserved.');
  }
}catch(error){console.error(error.code||'IMPORT_FAILED');console.error('Import did not complete. Source SQLite data is preserved.');process.exitCode=1;}
finally{profiles?.close();market?.close();await database.close();}
