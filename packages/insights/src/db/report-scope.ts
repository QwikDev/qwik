import { sql } from 'drizzle-orm';
import { getReportScope } from '~/report-scope';
import { type AppDatabase } from '.';

export async function loadReportScope(
  db: AppDatabase,
  publicApiKey: string,
  query: URLSearchParams
) {
  const builds = await db.all<{ hash: string; timestamp: number }>(sql`
    select hash, timestamp from (
      select hash, max(timestamp) as timestamp from manifests
      where public_api_key = ${publicApiKey}
      group by hash
      union all
      select manifest_hash as hash, min(timestamp) as timestamp from errors
      where public_api_key = ${publicApiKey}
        and manifest_hash is not null and manifest_hash <> ''
        and not exists (
          select 1 from manifests
          where manifests.public_api_key = ${publicApiKey}
            and manifests.hash = errors.manifest_hash
        )
      group by manifest_hash
    ) order by timestamp desc, hash limit 100
  `);
  return getReportScope(
    builds.map((build) => ({ ...build, timestamp: new Date(build.timestamp) })),
    query
  );
}
