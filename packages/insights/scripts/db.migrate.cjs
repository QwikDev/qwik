const { join } = require('node:path');
const { createClient } = require('@libsql/client');
const { migrate } = require('drizzle-orm/libsql/migrator');
const { drizzle } = require('drizzle-orm/libsql');

function readProductionDatabaseUrl(configPath = join(__dirname, '../wrangler.jsonc')) {
  const { readConfigFile, sys } = require('typescript');
  const { config, error } = readConfigFile(configPath, sys.readFile);
  const url = config?.vars?.PRIVATE_LIBSQL_DB_URL;
  if (error || typeof url !== 'string') {
    throw new Error('Missing database URL in the Worker configuration');
  }
  const parsed = new URL(url);
  if (
    !['libsql:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error('Production migrations require a remote database URL without credentials');
  }
  return url;
}

async function migrateDatabase({
  url,
  authToken,
  migrationsFolder = join(__dirname, '../drizzle'),
}) {
  const client = createClient({ url, authToken });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    client.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--production')) {
    throw new Error('Only --production is supported');
  }
  const isProduction = args.includes('--production');
  if (!isProduction) {
    require('dotenv').config({ quiet: true });
    require('dotenv').config({ path: '.env.local', quiet: true });
  }
  const url = isProduction ? readProductionDatabaseUrl() : process.env.PRIVATE_LIBSQL_DB_URL;
  const authToken = process.env.PRIVATE_LIBSQL_DB_API_TOKEN;
  if (!url || (isProduction && !authToken)) {
    throw new Error('Missing database credentials');
  }
  console.log('Applying database migrations...');
  await migrateDatabase({ url, authToken });
  console.log('Database migrations complete.');
}

module.exports = { migrateDatabase, readProductionDatabaseUrl };

if (require.main === module) {
  main().catch((error) => {
    // Driver errors can contain connection details or SQL values.
    const code =
      typeof error?.code === 'string' && /^[A-Z_0-9]+$/.test(error.code) ? ` (${error.code})` : '';
    console.error(`Database migration failed${code}. Check credentials and pending migration SQL.`);
    process.exitCode = 1;
  });
}
