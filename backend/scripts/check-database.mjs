import { PostgresDatabase } from '../src/postgres.mjs';
const database=new PostgresDatabase();
try {
  const result=await database.query('SELECT version,applied_at FROM foundry.schema_migrations ORDER BY version');
  console.log(JSON.stringify({provider:'supabase-postgres',connected:true,migrations:result.rows}));
}catch(error){console.error(JSON.stringify({provider:'supabase-postgres',connected:false,error:error.code||'DATABASE_UNAVAILABLE'}));process.exitCode=1;}
finally{await database.close();}
