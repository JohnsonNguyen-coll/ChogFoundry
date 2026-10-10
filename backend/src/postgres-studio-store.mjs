import { AppError } from './validation.mjs';

export function profileRow(row) {
  if(!row)return null;
  return {key:row.studio_key,tokenId:row.token_id,...row.profile_json,createdBy:row.created_by,createdAt:row.created_at,updatedBy:row.updated_by,updatedAt:row.updated_at,revision:Number(row.revision),ownershipEvidence:row.proof_json};
}
export class PostgresStudioStore {
  constructor(database){this.database=database;}
  async get(key){return profileRow((await this.database.query('SELECT * FROM foundry.studio_profiles WHERE studio_key=$1',[key])).rows[0]);}
  async list(){return (await this.database.query('SELECT * FROM foundry.studio_profiles ORDER BY updated_at DESC,studio_key LIMIT 50')).rows.map(profileRow);}
  async history(key){return (await this.database.query('SELECT revision,author,saved_at,proof_json FROM foundry.studio_revisions WHERE studio_key=$1 ORDER BY revision DESC LIMIT 100',[key])).rows.map(r=>({revision:Number(r.revision),author:r.author,savedAt:r.saved_at,ownershipEvidence:r.proof_json}));}
  async save(key,tokenId,input,author,evidence) {
    const {expectedRevision,...profile}=input;
    return this.database.transaction(async client=>{
      // Serialize first creation as well as updates without relying on an absent row lock.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['profile:'+key]);
      const current=(await client.query('SELECT * FROM foundry.studio_profiles WHERE studio_key=$1 FOR UPDATE',[key])).rows[0];
      if(Number(current?.revision??0)!==expectedRevision) throw new AppError(409,'REVISION_CONFLICT','The studio changed. Reload before saving.');
      const revision=expectedRevision+1,now=new Date().toISOString();
      const row=(await client.query(`INSERT INTO foundry.studio_profiles(studio_key,token_id,profile_json,created_by,created_at,updated_by,updated_at,revision,proof_json)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(studio_key) DO UPDATE SET profile_json=EXCLUDED.profile_json,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at,revision=EXCLUDED.revision,proof_json=EXCLUDED.proof_json RETURNING *`,[key,String(tokenId),JSON.stringify(profile),current?.created_by??author,current?.created_at??now,author,now,revision,JSON.stringify(evidence)])).rows[0];
      await client.query('INSERT INTO foundry.studio_revisions(studio_key,revision,author,profile_json,saved_at,proof_json) VALUES($1,$2,$3,$4,$5,$6)',[key,revision,author,JSON.stringify(profile),now,JSON.stringify(evidence)]);
      return profileRow(row);
    });
  }
  close(){} // The API owns the shared database pool.
}
