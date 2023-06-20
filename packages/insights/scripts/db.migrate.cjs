const { createClient } = require('@libsql/client');
const { migrate } = require('drizzle-orm/libsql/migrator');
const { drizzle } = require('drizzle-orm/libsql');
require('dotenv').config();
require('dotenv').config({ path: '.env.local' });

async function migrateDB() {
  const client = createClient({
    url: env('PRIVATE_LIBSQL_DB_URL'),
    authToken: env('PRIVATE_LIBSQL_DB_API_TOKEN'),
  });
  const db = drizzle(client);
  console.log('Migrating DB...');
  await migrate(db, { migrationsFolder: './drizzle' });
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
