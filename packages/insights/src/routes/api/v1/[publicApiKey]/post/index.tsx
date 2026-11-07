import { type RequestHandler } from '@builder.io/qwik-city';
import { InsightsPayload } from '@builder.io/qwik-labs';
import { getDB } from '~/db';
import { isRegisteredApp, updateEdge, updateRoutes } from '~/db/query';
import { dbGetManifestInfo } from '~/db/sql-manifest';
import { toBucket, toBucketTimeline } from '~/stats/vector';
import { readBoundedJson } from './read-bounded-json';

const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_SYMBOLS = 500;

export const onPost: RequestHandler = async ({ error, exit, json, request, params }) => {
  const payloadJson = await readBoundedJson(request, MAX_PAYLOAD_BYTES);
  if (payloadJson === undefined) {
    throw error(413, 'Payload Too Large');
  }
  migrate1(payloadJson);
  // Bind writes to the URL key so the body cannot target another application.
  payloadJson.publicApiKey = params.publicApiKey;
  const payload = InsightsPayload.parse(payloadJson);
  if (payload.symbols.length > MAX_SYMBOLS) {
    throw error(413, 'Too Many Symbols');
  }
  const db = getDB();
  const { publicApiKey, manifestHash } = payload;
  if (!(await isRegisteredApp(db, publicApiKey))) {
    throw error(404, 'Unknown Application');
  }
  // console.log('API: POST: symbol', payload);
  exit();
  json(200, { code: 200, message: 'OK' });
  let previousSymbol = payload.previousSymbol;
  await dbGetManifestInfo(db, publicApiKey, manifestHash);
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
