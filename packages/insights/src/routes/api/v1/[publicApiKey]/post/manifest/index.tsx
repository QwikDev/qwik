import { type RequestHandler } from '@qwik.dev/router';
import { and, eq } from 'drizzle-orm';
import { getDB, symbolDetailTable } from '~/db';
import { isRegisteredApp } from '~/db/query';
import { dbGetManifestInfo } from '~/db/sql-manifest';
import { QManifest } from '~/types/q-manifest';
import { readBoundedJson } from '../read-bounded-json';

const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
const MAX_MANIFEST_SYMBOLS = 10_000;

export const onPost: RequestHandler = async ({ error, exit, json, request, params }) => {
  // onsole.log('API: POST: symbol');
  const publicApiKey = params.publicApiKey;
  const db = getDB();
  if (!(await isRegisteredApp(db, publicApiKey))) {
    throw error(404, 'Unknown Application');
  }
  const manifestJson = await readBoundedJson(request, MAX_MANIFEST_BYTES);
  if (manifestJson === undefined) {
    throw error(413, 'Payload Too Large');
  }
  const qManifest = QManifest.parse(manifestJson);
  if (Object.keys(qManifest.symbols).length > MAX_MANIFEST_SYMBOLS) {
    throw error(413, 'Too Many Symbols');
  }
  try {
    const manifestHash = qManifest.manifestHash;
    exit();
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
