import { type RequestHandler } from '@builder.io/qwik-city';
import { and, eq } from 'drizzle-orm';
import { getDB, symbolDetailTable } from '~/db';
import { dbGetManifestInfo } from '~/db/sql-manifest';
import { QManifest } from '~/types/q-manifest';

export const onPost: RequestHandler = async ({ exit, json, request, params }) => {
  // onsole.log('API: POST: symbol');
  const publicApiKey = params.publicApiKey;
  try {
    const qManifest = QManifest.parse(await request.json());
    const manifestHash = qManifest.manifestHash;
    exit();
    const db = getDB();
    await dbGetManifestInfo(db, publicApiKey, manifestHash);
    const existing = await db
      .select()
      .from(symbolDetailTable)
      .where(
        and(
          eq(symbolDetailTable.publicApiKey, publicApiKey),
          eq(symbolDetailTable.manifestHash, manifestHash)
        )
      )
      .limit(1000)
      .all();
    const existingMap = new Map<string, (typeof existing)[0]>();
    existing.forEach((row) => existingMap.set(row.hash, row));
    const promises: Promise<any>[] = [];
    for (const symbol of Object.values(qManifest.symbols)) {
      const existing = existingMap.get(symbol.hash);
      const lo = symbol.loc[0];
      const hi = symbol.loc[1];
      if (existing) {
        if (
          existing.fullName !== symbol.displayName ||
          existing.origin !== symbol.origin ||
          existing.lo !== lo ||
          existing.hi !== hi
        ) {
          promises.push(
            db
              .update(symbolDetailTable)
              .set({
                fullName: symbol.displayName,
                origin: symbol.origin,
                lo,
                hi,
              })
              .where(eq(symbolDetailTable.id, existing.id))
              .run()
          );
        }
      } else {
        promises.push(
          db
            .insert(symbolDetailTable)
            .values({
              hash: symbol.hash,
              publicApiKey,
              manifestHash,
              fullName: symbol.displayName,
              origin: symbol.origin,
              lo,
              hi,
            })
            .run()
        );
      }
      if (promises.length > 10) {
        await Promise.all(promises);
        promises.length = 0;
      }
    }
    await Promise.all(promises);
    json(200, { code: 200, message: 'OK' });
  } catch (e) {
    console.error(JSON.stringify(e));
    json(500, { code: 500, message: 'Internal Server Error', error: e });
  }
};
