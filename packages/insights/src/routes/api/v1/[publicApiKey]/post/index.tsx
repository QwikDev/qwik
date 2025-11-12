import { type RequestHandler } from '@builder.io/qwik-city';
import { InsightsPayload } from '@builder.io/qwik-labs';
import { getDB } from '~/db';
import { getAppInfo, updateEdge, updateRoutes } from '~/db/query';
import { dbGetManifestInfo } from '~/db/sql-manifest';
import { toBucket, toBucketTimeline } from '~/stats/vector';

export const onPost: RequestHandler = async ({ exit, json, request, params }) => {
  const payloadJson = await request.json();
  migrate1(payloadJson);
  // publicApiKey is always part of the URL as route parameter.
  if (!payloadJson.publicApiKey) {
    payloadJson.publicApiKey = params.publicApiKey;
  }
  const payload = InsightsPayload.parse(payloadJson);
  // console.log('API: POST: symbol', payload);
  exit();
  json(200, { code: 200, message: 'OK' });
  const db = getDB();
  let previousSymbol = payload.previousSymbol;
  const { publicApiKey, manifestHash } = payload;
  await dbGetManifestInfo(db, publicApiKey, manifestHash);
  if (publicApiKey && publicApiKey.length > 4) {
    await getAppInfo(db, publicApiKey, { autoCreate: true });
    for (const event of payload.symbols) {
      const symbolHash = cleanupSymbolName(event.symbol);
      if (symbolHash) {
        await updateEdge(db, {
          publicApiKey,
          manifestHash,
          from: previousSymbol,
          to: symbolHash,
          interaction: event.interaction,
          delayBucket: toBucket(event.delay),
          latencyBucket: toBucket(event.latency),
        });
        await updateRoutes(db, {
          publicApiKey,
          manifestHash,
          route: event.route,
          symbol: symbolHash,
          timelineBucket: toBucketTimeline(event.timeline),
        });
      }
      previousSymbol = symbolHash;
    }
  }
};

function cleanupSymbolName(symbolName?: string | null): string | null {
  if (!symbolName) {
    return null;
  }
  const shortName = symbolName.substring(symbolName.lastIndexOf('_') + 1 || 0);
  if (shortName == 'hW') {
    return null;
  }
  return shortName;
}
function migrate1(payloadJson: any) {
  // delete payloadJson.sessionID;
  if (!('qVersion' in payloadJson)) {
    payloadJson.qVersion = 'unknown';
  }
}
