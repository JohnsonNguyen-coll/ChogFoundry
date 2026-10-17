import { readFile } from 'node:fs/promises';
import { PostgresDatabase } from '../src/postgres.mjs';
const database=new PostgresDatabase();
try {
  for (const file of ['001_foundry.sql','002_community.sql']) {
    const sql=await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
    await database.transaction(client=>client.query(sql));
  }
  console.log('Foundry Supabase schema migrations 1 and 2 applied. No application data seeded.');
}catch(error){console.error(error.code||'MIGRATION_FAILED');console.error('Migration failed. Check backend connection and schema permissions. No connection strings are logged.');process.exitCode=1;}
finally{await database.close();}
