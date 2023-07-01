import { type RequestHandler } from '@builder.io/qwik-city';
import { applicationTable, getDB, symbolTable } from '~/db';
import { InsightsPayload } from '@builder.io/qwik-labs';
import { eq } from 'drizzle-orm';

export const onPost: RequestHandler = async ({ exit, json, request }) => {
  // console.log('API: POST: symbol');
  const payload = InsightsPayload.parse(await request.json());
  exit();
  json(200, { code: 200, message: 'OK' });
  const db = getDB();
  let previousSymbol = payload.previousSymbol;
  const publicApiKey = payload.publicApiKey;
  if (publicApiKey && publicApiKey.length > 4) {
    const apps = await db
      .select()
      .from(applicationTable)
      .where(eq(applicationTable.publicApiKey, publicApiKey))
      .all();
    if (apps.length == 0) {
      await db
        .insert(applicationTable)
        .values({
          name: 'Auto create: ' + publicApiKey,
          description: 'Auto create: ' + publicApiKey,
          publicApiKey,
        })
        .run();
    }
  }
  const sessionID = payload.sessionID;
  for (const event of payload.symbols) {
    await db
      .insert(symbolTable)
      .values({
        publicApiKey,
        pathname: event.pathname,
        sessionID,
        previousSymbol: event.interaction || event.timeDelta > 250 ? null : previousSymbol,
        symbol: event.symbol,
        interaction: event.interaction ? 1 : 0,
        timeDelta: event.timeDelta,
        loadDelay: event.loadDelay,
      })
      .run();
    previousSymbol = event.symbol;
  }
};
