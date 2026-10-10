import pg from 'pg';
import { readFileSync } from 'node:fs';
import { AppError } from './validation.mjs';

export function postgresOptions(value,caPath) {
  if(!value) return null;
  let url;try{url=new URL(value);}catch{throw new AppError(503,'INVALID_DATABASE_CONFIG','Invalid backend PostgreSQL connection configuration.');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password) throw new AppError(503,'INVALID_DATABASE_CONFIG','Use a complete PostgreSQL connection string from Supabase Connect.');
  // pg connection-string SSL parameters can override the explicit SSL object.
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert','ssl','uselibpqcompat']) url.searchParams.delete(key);
  return {connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(caPath?{ca:readFileSync(caPath,'utf8')}:{})},max:5,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,statement_timeout:20000};
}
export class PostgresDatabase {
  constructor({url=process.env.SUPABASE_DATABASE_URL,caPath=process.env.SUPABASE_DB_CA_PATH}={}) {
    const options=postgresOptions(url,caPath);this.configured=!!options;this.provider='supabase-postgres';
    this.pool=options?new pg.Pool(options):null;
    this.pool?.on('error',()=>{}); // Driver error text can contain credentials; never log it.
  }
  async query(text,values=[]) {
    if(!this.pool) throw new AppError(503,'SUPABASE_NOT_CONFIGURED','Set SUPABASE_DATABASE_URL in the backend environment. No SQLite fallback is used.');
    try{return await this.pool.query(text,values);}catch{throw new AppError(503,'DATABASE_UNAVAILABLE','Unable to read or write Supabase PostgreSQL. Check connection and migration status.');}
  }
  async transaction(action,{readOnly=false}={}) {
    if(!this.pool) throw new AppError(503,'SUPABASE_NOT_CONFIGURED','Supabase PostgreSQL is not configured.');
    let client;
    try {
      client=await this.pool.connect();await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
      const result=await action(client);await client.query('COMMIT');return result;
    } catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});if(error instanceof AppError)throw error;throw new AppError(503,'DATABASE_UNAVAILABLE','Supabase PostgreSQL transaction failed. No local fallback was written.');}
    finally{client?.release();}
  }
  async close(){await this.pool?.end();}
}
