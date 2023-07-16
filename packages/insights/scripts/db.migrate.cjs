require('dotenv').config();
require('dotenv').config({ path: '.env.local' });

async function migrateDB() {
  const url = env('PRIVATE_LIBSQL_DB_URL');
  const authToken = env('PRIVATE_LIBSQL_DB_API_TOKEN');
  await migrateLibSql(url, authToken);
}

async function migrateLibSql(url, authToken) {
  const { createClient } = require('@libsql/client');
  const { migrate } = require('drizzle-orm/libsql/migrator');
  const { drizzle } = require('drizzle-orm/libsql');

  const client = createClient({ url, authToken });
  const db = drizzle(client);
  console.log('Migrating DB...');
  try {
    await migrate(db, { migrationsFolder: './drizzle' });
  } catch (e) {
    console.error(e);
  }
  console.log('DB migrated');
}

function env(name) {
  const value = globalThis[name] || process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

migrateDB().then(
  (e) => {
    process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
