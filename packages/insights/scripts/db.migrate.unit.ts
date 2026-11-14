import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const directories: string[] = [];
const scriptPath = fileURLToPath(new URL('./db.migrate.cjs', import.meta.url));
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function createDatabaseFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'insights-migration-'));
  directories.push(directory);
  return { directory, url: `file:${join(directory, 'test.db')}` };
}

// Child processes release native SQLite handles before Windows cleanup.
function runDatabaseScript(script: string, args: string[]) {
  return spawnSync(process.execPath, ['-e', script, ...args], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    timeout: 10_000,
  });
}

function executeSql(url: string, sql: string): unknown[] {
  const result = runDatabaseScript(
    `const { createClient } = require('@libsql/client');
const client = createClient({ url: process.argv[1] });
client.execute(process.argv[2])
  .then(result => console.log(JSON.stringify(result.rows)))
  .finally(() => client.close());`,
    [url, sql]
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function runMigrations(url: string, migrationsFolder: string) {
  return runDatabaseScript(
    `const { migrateDatabase } = require(process.argv[1]);
migrateDatabase({ url: process.argv[2], migrationsFolder: process.argv[3] })
  .catch(() => { process.exitCode = 1; });`,
    [scriptPath, url, migrationsFolder]
  );
}

async function writeMigrationFiles(directory: string, statements: string[]) {
  await mkdir(join(directory, 'meta'), { recursive: true });
  await writeFile(
    join(directory, 'meta/_journal.json'),
    JSON.stringify({
      entries: statements.map((_, index) => ({
        idx: index,
        when: index + 1,
        tag: `migration_${index}`,
        breakpoints: true,
      })),
    })
  );
  await Promise.all(
    statements.map((sql, index) => writeFile(join(directory, `migration_${index}.sql`), sql))
  );
}

test('the migration command exits unsuccessfully when SQL fails', async () => {
  const { url } = await createDatabaseFixture();
  executeSql(url, 'CREATE TABLE applications (id INTEGER PRIMARY KEY)');
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: {
      ...process.env,
      PRIVATE_LIBSQL_DB_URL: url,
      PRIVATE_LIBSQL_DB_API_TOKEN: 'test-token-do-not-log',
    },
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stdout).not.toMatch(/DB migrated|migrations complete/);
  expect(result.stdout + result.stderr).not.toContain('test-token-do-not-log');
});

test('applies pending migrations once and rolls back a failed migration', async () => {
  const { directory, url } = await createDatabaseFixture();
  const migrationsFolder = join(directory, 'migrations');
  const initial =
    "CREATE TABLE examples (value TEXT); --> statement-breakpoint\nINSERT INTO examples VALUES ('once');";
  await writeMigrationFiles(migrationsFolder, [initial]);
  expect(runMigrations(url, migrationsFolder).status).toBe(0);
  expect(runMigrations(url, migrationsFolder).status).toBe(0);
  expect(executeSql(url, 'SELECT * FROM examples')).toHaveLength(1);
  expect(executeSql(url, 'SELECT * FROM __drizzle_migrations')).toHaveLength(1);
  await writeMigrationFiles(migrationsFolder, [
    initial,
    "INSERT INTO examples VALUES ('rollback'); --> statement-breakpoint\nINVALID SQL",
  ]);
  expect(runMigrations(url, migrationsFolder).status).toBe(1);
  expect(executeSql(url, 'SELECT * FROM examples')).toHaveLength(1);
  expect(executeSql(url, 'SELECT * FROM __drizzle_migrations')).toHaveLength(1);
});

test('production migrations read the Worker database URL from JSONC', async () => {
  const { readProductionDatabaseUrl } = require('./db.migrate.cjs');
  const { directory } = await createDatabaseFixture();
  const configPath = join(directory, 'wrangler.jsonc');
  await writeFile(
    configPath,
    '{ // Worker configuration\n "vars": {"PRIVATE_LIBSQL_DB_URL": "libsql://insights.example",},}'
  );
  expect(readProductionDatabaseUrl(configPath)).toBe('libsql://insights.example');
});

test.each([
  '{}',
  '{invalid JSON',
  '{"vars":{"PRIVATE_LIBSQL_DB_URL":"file:local.db"}}',
  '{"vars":{"PRIVATE_LIBSQL_DB_URL":"https://user:password@example.com"}}',
])('rejects an invalid production database configuration: %s', async (config) => {
  const { readProductionDatabaseUrl } = require('./db.migrate.cjs');
  const { directory } = await createDatabaseFixture();
  const configPath = join(directory, 'wrangler.jsonc');
  await writeFile(configPath, config);
  expect(() => readProductionDatabaseUrl(configPath)).toThrow();
});

test('production mode requires a token and does not load local credentials', async () => {
  const { directory, url } = await createDatabaseFixture();
  await writeFile(
    join(directory, '.env.local'),
    `PRIVATE_LIBSQL_DB_URL=${url}\nPRIVATE_LIBSQL_DB_API_TOKEN=test-token-do-not-log\n`
  );
  const result = spawnSync(process.execPath, [scriptPath, '--production'], {
    cwd: directory,
    env: { ...process.env, PRIVATE_LIBSQL_DB_URL: url, PRIVATE_LIBSQL_DB_API_TOKEN: '' },
    encoding: 'utf8',
  });
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain('test-token-do-not-log');
});
