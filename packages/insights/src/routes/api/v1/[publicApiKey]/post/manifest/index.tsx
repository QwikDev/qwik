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

    console.log(
      `Processing manifest ${manifestHash} for API key ${publicApiKey} with ${Object.keys(qManifest.symbols).length} symbols`
    );

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

    console.log(`Found ${existing.length} existing symbols for manifest ${manifestHash}`);

    const existingMap = new Map<string, (typeof existing)[0]>();
    existing.forEach((row) => existingMap.set(row.hash, row));
    const promises: Promise<any>[] = [];

    let insertCount = 0;
    let updateCount = 0;

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
          updateCount++;
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
              .catch((error) => {
                console.error(`Failed to update symbol ${symbol.hash}:`, error);
                throw error;
              })
          );
        }
      } else {
        insertCount++;
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
            .catch((error) => {
              console.error(
                `Failed to insert symbol ${symbol.hash} for manifest ${manifestHash}:`,
                {
                  error: error.message,
                  symbol: {
                    hash: symbol.hash,
                    displayName: symbol.displayName,
                    origin: symbol.origin,
                  },
                }
              );
              throw error;
            })
        );
      }
      if (promises.length > 10) {
        await Promise.all(promises);
        promises.length = 0;
      }
    }
    await Promise.all(promises);

    console.log(
      `Successfully processed manifest ${manifestHash}: ${insertCount} inserts, ${updateCount} updates`
    );
    json(200, { code: 200, message: 'OK' });
  } catch (e) {
    console.error(`Error processing manifest for API key ${publicApiKey}:`, {
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
      publicApiKey,
    });
    json(500, { code: 500, message: 'Internal Server Error', error: e });
  }
};
