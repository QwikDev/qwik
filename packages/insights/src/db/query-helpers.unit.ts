import { createClient } from '@libsql/client';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { delayColumnSumList, latencyColumnSumList, timelineDelayAsList } from './query-helpers';

describe('histogram aggregation', () => {
  for (const [name, table, prefix, expression] of [
    ['latency', 'edges', 'latency_count_', latencyColumnSumList],
    ['delay', 'edges', 'delay_count_', delayColumnSumList],
    ['timeline', 'routes', 'timeline_', timelineDelayAsList],
  ] as const) {
    it(`preserves all 50 ${name} buckets and their order`, async () => {
      const client = createClient({ url: ':memory:' });
      try {
        const columns = Array.from(
          { length: 50 },
          (_, i) => `${prefix}${String(i).padStart(2, '0')}`
        );
        const row = Array.from({ length: 50 }, (_, i) => i).join(', ');
        const { sql, params } = new SQLiteSyncDialect().sqlToQuery(expression);
        expect(params).toEqual([]);
        const result = await client.execute({
          sql: `WITH ${table} (${columns.join(', ')}) AS (VALUES (${row}), (${row})) SELECT ${sql} AS buckets FROM ${table}`,
        });
        expect(result.rows[0].buckets).toBe(Array.from({ length: 50 }, (_, i) => i * 2).join(';'));
      } finally {
        client.close();
      }
    });
  }
});
