import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
  foreignKey,
} from 'drizzle-orm/sqlite-core';

export type DatabaseSchema = {
  applicationTable: typeof applicationTable;
  manifestTabes: typeof manifestTable;
  symbolTable: typeof symbolTable;
  symbolDetailTable: typeof symbolDetailTable;
  errorTable: typeof errorTable;
};

export const applicationTable = sqliteTable(
  'applications',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    url: text('url'),
    publicApiKey: text('public_api_key').notNull(),
  },
  (applications) => ({
    publicApiKeyIndex: uniqueIndex('publicApiKeyIndex').on(applications.publicApiKey),
  })
);

export type ApplicationRow = InferSelectModel<typeof applicationTable>;
export type ApplicationRowSansId = InferInsertModel<typeof applicationTable>;

export const symbolTable = sqliteTable('symbols', {
  id: integer('id').primaryKey(),
  publicApiKey: text('public_api_key').references(() => applicationTable.publicApiKey),
  pathname: text('pathname').notNull(),
  interaction: integer('interaction').notNull(),
  symbol: text('symbol').notNull(),
  previousSymbol: text('prev_symbol'),
  timeDelta: integer('time_delta_ms').notNull(),
  loadDelay: integer('load_delay_ms').notNull(),
});

export type SymbolRow = InferSelectModel<typeof symbolTable>;
export type SymbolRowSansId = InferInsertModel<typeof symbolTable>;

// event, source, lineno, colno, error
export const errorTable = sqliteTable('errors', {
  id: integer('id').primaryKey(),
  publicApiKey: text('public_api_key').references(() => applicationTable.publicApiKey),
  manifestHash: text('manifest_hash').references(() => manifestTable.hash),
  timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  url: text('url').notNull(),
  source: text('source').notNull(),
  line: integer('line').notNull(),
  column: integer('column').notNull(),
  message: text('message').notNull(),
  error: text('error').notNull(),
  stack: text('stack').notNull(),
});

export type ErrorRow = InferSelectModel<typeof errorTable>;

export const manifestTable = sqliteTable(
  'manifests',
  {
    id: integer('id').primaryKey(),
    publicApiKey: text('public_api_key').references(() => applicationTable.publicApiKey),
    hash: text('hash').notNull(),
    timestamp: integer('timestamp', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => ({
    publicApiKeyHashIndex: index('idx_manifests_apiKey_hash').on(table.hash, table.publicApiKey),
    publicApiKeyHashIndex_2: index('idx_manifests_apiKey_hash_2').on(
      table.publicApiKey,
      table.hash
    ),
    apiTimestamp: index('idx_manifest_api_timestamp').on(table.publicApiKey, table.timestamp),
    publicApiKeyIndex: index('idx_manifests_public_apiKey').on(table.publicApiKey),
    hashIndex: index('idx_manifests_hash').on(table.hash),
  })
);

export type ManifestRow = InferSelectModel<typeof manifestTable>;

export const symbolDetailTable = sqliteTable(
  'symbolDetail',
  {
    id: integer('id').primaryKey(),
    hash: text('hash').notNull(),
    publicApiKey: text('public_api_key'),
    manifestHash: text('manifest_hash'),
    fullName: text('full_name').notNull(),
    origin: text('origin').notNull(),
    lo: integer('lo').notNull(),
    hi: integer('hi').notNull(),
  },
  (symbolDetailTable) => ({
    apiKeyManifestHashIndex: uniqueIndex('idx_symbolDetail_apiKey_manifestHash').on(
      symbolDetailTable.publicApiKey,
      symbolDetailTable.manifestHash
    ),
    publicApiKeyReference: foreignKey({
      columns: [symbolDetailTable.publicApiKey],
      foreignColumns: [applicationTable.publicApiKey],
    }),
    manifestHashReference: foreignKey({
      columns: [symbolDetailTable.publicApiKey, symbolDetailTable.manifestHash],
      foreignColumns: [manifestTable.publicApiKey, manifestTable.hash],
    }),
  })
);

export type SymbolDetailRow = InferSelectModel<typeof symbolDetailTable>;
export type SymbolDetailRowSansId = InferInsertModel<typeof symbolDetailTable>;

export const edgeTable = sqliteTable(
  'edges',
  {
    id: integer('id').primaryKey(),
    publicApiKey: text('public_api_key').references(() => applicationTable.publicApiKey),
    manifestHash: text('manifest_hash').notNull(),
    from: text('from'),
    to: text('to').notNull(),
    interaction: integer('interaction').notNull(),
    delayCount00: integer('delay_count_00').notNull(),
    delayCount01: integer('delay_count_01').notNull(),
    delayCount02: integer('delay_count_02').notNull(),
    delayCount03: integer('delay_count_03').notNull(),
    delayCount04: integer('delay_count_04').notNull(),
    delayCount05: integer('delay_count_05').notNull(),
    delayCount06: integer('delay_count_06').notNull(),
    delayCount07: integer('delay_count_07').notNull(),
    delayCount08: integer('delay_count_08').notNull(),
    delayCount09: integer('delay_count_09').notNull(),
    delayCount10: integer('delay_count_10').notNull(),
    delayCount11: integer('delay_count_11').notNull(),
    delayCount12: integer('delay_count_12').notNull(),
    delayCount13: integer('delay_count_13').notNull(),
    delayCount14: integer('delay_count_14').notNull(),
    delayCount15: integer('delay_count_15').notNull(),
    delayCount16: integer('delay_count_16').notNull(),
    delayCount17: integer('delay_count_17').notNull(),
    delayCount18: integer('delay_count_18').notNull(),
    delayCount19: integer('delay_count_19').notNull(),
    delayCount20: integer('delay_count_20').notNull(),
    delayCount21: integer('delay_count_21').notNull(),
    delayCount22: integer('delay_count_22').notNull(),
    delayCount23: integer('delay_count_23').notNull(),
    delayCount24: integer('delay_count_24').notNull(),
    delayCount25: integer('delay_count_25').notNull(),
    delayCount26: integer('delay_count_26').notNull(),
    delayCount27: integer('delay_count_27').notNull(),
    delayCount28: integer('delay_count_28').notNull(),
    delayCount29: integer('delay_count_29').notNull(),
    delayCount30: integer('delay_count_30').notNull(),
    delayCount31: integer('delay_count_31').notNull(),
    delayCount32: integer('delay_count_32').notNull(),
    delayCount33: integer('delay_count_33').notNull(),
    delayCount34: integer('delay_count_34').notNull(),
    delayCount35: integer('delay_count_35').notNull(),
    delayCount36: integer('delay_count_36').notNull(),
    delayCount37: integer('delay_count_37').notNull(),
    delayCount38: integer('delay_count_38').notNull(),
    delayCount39: integer('delay_count_39').notNull(),
    delayCount40: integer('delay_count_40').notNull(),
    delayCount41: integer('delay_count_41').notNull(),
    delayCount42: integer('delay_count_42').notNull(),
    delayCount43: integer('delay_count_43').notNull(),
    delayCount44: integer('delay_count_44').notNull(),
    delayCount45: integer('delay_count_45').notNull(),
    delayCount46: integer('delay_count_46').notNull(),
    delayCount47: integer('delay_count_47').notNull(),
    delayCount48: integer('delay_count_48').notNull(),
    delayCount49: integer('delay_count_49').notNull(),
    latencyCount00: integer('latency_count_00').notNull(),
    latencyCount01: integer('latency_count_01').notNull(),
    latencyCount02: integer('latency_count_02').notNull(),
    latencyCount03: integer('latency_count_03').notNull(),
    latencyCount04: integer('latency_count_04').notNull(),
    latencyCount05: integer('latency_count_05').notNull(),
    latencyCount06: integer('latency_count_06').notNull(),
    latencyCount07: integer('latency_count_07').notNull(),
    latencyCount08: integer('latency_count_08').notNull(),
    latencyCount09: integer('latency_count_09').notNull(),
    latencyCount10: integer('latency_count_10').notNull(),
    latencyCount11: integer('latency_count_11').notNull(),
    latencyCount12: integer('latency_count_12').notNull(),
    latencyCount13: integer('latency_count_13').notNull(),
    latencyCount14: integer('latency_count_14').notNull(),
    latencyCount15: integer('latency_count_15').notNull(),
    latencyCount16: integer('latency_count_16').notNull(),
    latencyCount17: integer('latency_count_17').notNull(),
    latencyCount18: integer('latency_count_18').notNull(),
    latencyCount19: integer('latency_count_19').notNull(),
    latencyCount20: integer('latency_count_20').notNull(),
    latencyCount21: integer('latency_count_21').notNull(),
    latencyCount22: integer('latency_count_22').notNull(),
    latencyCount23: integer('latency_count_23').notNull(),
    latencyCount24: integer('latency_count_24').notNull(),
    latencyCount25: integer('latency_count_25').notNull(),
    latencyCount26: integer('latency_count_26').notNull(),
    latencyCount27: integer('latency_count_27').notNull(),
    latencyCount28: integer('latency_count_28').notNull(),
    latencyCount29: integer('latency_count_29').notNull(),
    latencyCount30: integer('latency_count_30').notNull(),
    latencyCount31: integer('latency_count_31').notNull(),
    latencyCount32: integer('latency_count_32').notNull(),
    latencyCount33: integer('latency_count_33').notNull(),
    latencyCount34: integer('latency_count_34').notNull(),
    latencyCount35: integer('latency_count_35').notNull(),
    latencyCount36: integer('latency_count_36').notNull(),
    latencyCount37: integer('latency_count_37').notNull(),
    latencyCount38: integer('latency_count_38').notNull(),
    latencyCount39: integer('latency_count_39').notNull(),
    latencyCount40: integer('latency_count_40').notNull(),
    latencyCount41: integer('latency_count_41').notNull(),
    latencyCount42: integer('latency_count_42').notNull(),
    latencyCount43: integer('latency_count_43').notNull(),
    latencyCount44: integer('latency_count_44').notNull(),
    latencyCount45: integer('latency_count_45').notNull(),
    latencyCount46: integer('latency_count_46').notNull(),
    latencyCount47: integer('latency_count_47').notNull(),
    latencyCount48: integer('latency_count_48').notNull(),
    latencyCount49: integer('latency_count_49').notNull(),
  },
  (table) => ({
    publicApiKyIndex: index('edgeIndex_PublicApiKey').on(table.publicApiKey),
    publicApiKeyIndex: index('idx_edge_publicApiKey_manifestHash').on(table.publicApiKey),
    publicApiKeyManifestHashIndex: index('idx_edge_publicApiKey_manifestHash').on(
      table.publicApiKey,
      table.manifestHash
    ),
    edgeIndex: index('idx_edge_apiKey_manifestHash_from_to').on(
      table.publicApiKey,
      table.manifestHash,
      table.from,
      table.to
    ),
    idx_edge_from_to: index('idx_edge_from_to').on(table.from, table.to),
    idx_apiKey_hash_from: index('idx_apiKey_hash_from').on(
      table.publicApiKey,
      table.from,
      table.manifestHash
    ),
    idx_hash_to: index('idx_hash_to').on(table.manifestHash, table.to),
  })
);

export type EdgeRow = InferSelectModel<typeof edgeTable>;
export type EdgeRowSansId = InferInsertModel<typeof edgeTable>;

export const routesTable = sqliteTable(
  'routes',
  {
    id: integer('id').primaryKey(),
    publicApiKey: text('public_api_key').references(() => applicationTable.publicApiKey),
    manifestHash: text('manifest_hash').notNull(),
    route: text('route').notNull(),
    symbol: text('symbol').notNull(),
    timeline00: integer('timeline_00').notNull(),
    timeline01: integer('timeline_01').notNull(),
    timeline02: integer('timeline_02').notNull(),
    timeline03: integer('timeline_03').notNull(),
    timeline04: integer('timeline_04').notNull(),
    timeline05: integer('timeline_05').notNull(),
    timeline06: integer('timeline_06').notNull(),
    timeline07: integer('timeline_07').notNull(),
    timeline08: integer('timeline_08').notNull(),
    timeline09: integer('timeline_09').notNull(),
    timeline10: integer('timeline_10').notNull(),
    timeline11: integer('timeline_11').notNull(),
    timeline12: integer('timeline_12').notNull(),
    timeline13: integer('timeline_13').notNull(),
    timeline14: integer('timeline_14').notNull(),
    timeline15: integer('timeline_15').notNull(),
    timeline16: integer('timeline_16').notNull(),
    timeline17: integer('timeline_17').notNull(),
    timeline18: integer('timeline_18').notNull(),
    timeline19: integer('timeline_19').notNull(),
    timeline20: integer('timeline_20').notNull(),
    timeline21: integer('timeline_21').notNull(),
    timeline22: integer('timeline_22').notNull(),
    timeline23: integer('timeline_23').notNull(),
    timeline24: integer('timeline_24').notNull(),
    timeline25: integer('timeline_25').notNull(),
    timeline26: integer('timeline_26').notNull(),
    timeline27: integer('timeline_27').notNull(),
    timeline28: integer('timeline_28').notNull(),
    timeline29: integer('timeline_29').notNull(),
    timeline30: integer('timeline_30').notNull(),
    timeline31: integer('timeline_31').notNull(),
    timeline32: integer('timeline_32').notNull(),
    timeline33: integer('timeline_33').notNull(),
    timeline34: integer('timeline_34').notNull(),
    timeline35: integer('timeline_35').notNull(),
    timeline36: integer('timeline_36').notNull(),
    timeline37: integer('timeline_37').notNull(),
    timeline38: integer('timeline_38').notNull(),
    timeline39: integer('timeline_39').notNull(),
    timeline40: integer('timeline_40').notNull(),
    timeline41: integer('timeline_41').notNull(),
    timeline42: integer('timeline_42').notNull(),
    timeline43: integer('timeline_43').notNull(),
    timeline44: integer('timeline_44').notNull(),
    timeline45: integer('timeline_45').notNull(),
    timeline46: integer('timeline_46').notNull(),
    timeline47: integer('timeline_47').notNull(),
    timeline48: integer('timeline_48').notNull(),
    timeline49: integer('timeline_49').notNull(),
  },
  (table) => ({
    routeSymbolIndex: uniqueIndex('routeIndex_Symbol').on(
      table.publicApiKey,
      table.manifestHash,
      table.route,
      table.symbol
    ),
    publicApiKeyAndManifestHashIndex: index('idx_routes_publicApiKey_manifestHash').on(
      table.publicApiKey,
      table.manifestHash
    ),
  })
);

export type RouteRow = InferSelectModel<typeof routesTable>;
export type RouteRowSansId = InferInsertModel<typeof routesTable>;

export const usersTable = sqliteTable(
  'users',
  {
    id: integer('user_id').primaryKey(),
    email: text('email').notNull(),
    created: integer('created', { mode: 'timestamp_ms' }).notNull(),
    superUser: integer('super_user', { mode: 'boolean' }).notNull(),
  },
  (table) => ({
    emailIndex: uniqueIndex('emailIndex').on(table.email),
  })
);

export const userApplicationMap = sqliteTable(
  'userApplicationMap',
  {
    applicationId: integer('application_id').references(() => applicationTable.id),
    userId: integer('user_id').references(() => usersTable.id),
  },
  (table) => ({
    userApplicationIndex: uniqueIndex('userApplicationIndex').on(table.applicationId, table.userId),
  })
);
