import { type RequestHandler } from '@builder.io/qwik-city';
import { eq } from 'drizzle-orm';
import { getDB, symbolDetailTable } from '~/db';
import { QManifest } from '~/types/q-manifest';

export const onPost: RequestHandler = async ({ exit, json, request, params }) => {
  // onsole.log('API: POST: symbol');
  const publicApiKey = params.publicApiKey;
  try {
    const qManifest = QManifest.parse(await request.json());
    exit();
    const db = getDB();
    const existing = await db
      .select()
      .from(symbolDetailTable)
      .where(eq(symbolDetailTable.publicApiKey, publicApiKey))
      .all();
    const existingMap = new Map<string, (typeof existing)[0]>();
    existing.forEach((row) => existingMap.set(row.hash, row));
    const promises: Promise<any>[] = [];
    for (const symbol of Object.values(qManifest.symbols)) {
      const existing = existingMap.get(symbol.hash);
      if (existing) {
        if (existing.fullName !== symbol.displayName || existing.origin !== symbol.origin) {
          promises.push(
            db
              .update(symbolDetailTable)
              .set({ fullName: symbol.displayName, origin: symbol.origin })
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
              fullName: symbol.displayName,
              origin: symbol.origin,
            })
            .run()
        );
      }
    }
    await Promise.all(promises);
  } catch (e) {
    console.error(JSON.stringify(e));
    json(500, { code: 500, message: 'Internal Server Error', error: e });
  }
  json(200, { code: 200, message: 'OK' });
};
