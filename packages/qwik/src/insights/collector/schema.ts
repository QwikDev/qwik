import type { InsightsDb } from '../db';
import journal from '../../../../insights/drizzle/meta/_journal.json';

// The Insights dashboard's drizzle migrations are the one schema for every insights DB.
const migrationFiles = import.meta.glob('../../../../insights/drizzle/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Bookkeeping table and columns used by drizzle's migrator, so either tool can migrate a DB. */
const MIGRATIONS_TABLE = '__drizzle_migrations';

interface Migration {
  sql: string;
  createdAt: number;
}

function readMigrations(): Migration[] {
  return journal.entries.map((entry) => {
    const sql = migrationFiles[`../../../../insights/drizzle/${entry.tag}.sql`];
    if (sql === undefined) {
      throw new Error(`Insights migration ${entry.tag} is missing`);
    }
    return { sql, createdAt: entry.when };
  });
}

async function hasTable(db: InsightsDb, table: string): Promise<boolean> {
  const rows = await db.all(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, [
    table,
  ]);
  return rows.length > 0;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Bring a DB up to the dashboard's schema, recording each migration the way drizzle does, so the
 * dashboard's own `db.migrate` and this collector agree on what is applied.
 *
 * @internal
 */
export async function migrateInsightsDb(db: InsightsDb): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`
  );
  const [lastApplied] = await db.all(
    `SELECT created_at FROM ${MIGRATIONS_TABLE} ORDER BY created_at DESC LIMIT 1`
  );
  if (!lastApplied && (await hasTable(db, 'applications'))) {
    throw new Error(
      'This insights DB was created by a pre-release collector with an older schema. Delete it and collect again.'
    );
  }
  const appliedUntil = lastApplied ? Number(lastApplied.created_at) : -Infinity;
  const pending = readMigrations().filter((migration) => migration.createdAt > appliedUntil);
  if (!pending.length) {
    return;
  }
  const steps: string[] = [];
  for (let i = 0; i < pending.length; i++) {
    const { sql, createdAt } = pending[i];
    const hash = await sha256Hex(sql);
    steps.push(
      sql.replaceAll('--> statement-breakpoint', ';'),
      `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES ('${hash}', ${createdAt})`
    );
  }
  try {
    await db.exec(`BEGIN;\n${steps.join(';\n')};\nCOMMIT;`);
  } catch (error) {
    try {
      await db.exec('ROLLBACK');
    } catch {
      // Nothing was left open.
    }
    throw error;
  }
}
