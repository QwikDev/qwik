import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export type DatabaseSchema = {
  applicationTable: typeof applicationTable;
  symbolTable: typeof symbolTable;
};

export const applicationTable = sqliteTable(
  'applications',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    publicApiKey: text('public_api_key').notNull(),
  },
  (applications) => ({
    publicApiKeyIndex: uniqueIndex('publicApiKeyIndex').on(applications.publicApiKey),
  })
);

export const symbolTable = sqliteTable('symbols', {
  id: integer('id').primaryKey(),
  publicApiKey: text('public_api_key').references(() => applicationTable.publicApiKey),
  pathname: text('pathname').notNull(),
  interaction: integer('interaction').notNull(),
  symbol: text('symbol').notNull(),
  sessionID: text('session_id').notNull(),
  previousSymbol: text('prev_symbol'),
  timeDelta: integer('time_delta_ms').notNull(),
  loadDelay: integer('load_delay_ms').notNull(),
});

// event, source, lineno, colno, error
export const errorTable = sqliteTable('errors', {
  id: integer('id').primaryKey(),
  publicApiKey: text('public_api_key').references(() => applicationTable.publicApiKey),
  timestamp: integer('timestamp').notNull(),
  sessionID: text('session_id').notNull(),
  url: text('url').notNull(),
  source: text('source').notNull(),
  line: integer('line').notNull(),
  column: integer('column').notNull(),
  message: text('message').notNull(),
  error: text('error').notNull(),
  stack: text('stack').notNull(),
});
