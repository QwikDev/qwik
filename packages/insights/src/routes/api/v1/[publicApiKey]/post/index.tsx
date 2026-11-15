import { type RequestHandler } from '@qwik.dev/router';
import { recordInsightsBeacon } from '@qwik.dev/core/insights/collector';
import { getDB, getInsightsDb } from '~/db';
import { isRegisteredApp } from '~/db/query';
import { InsightsPayload } from '~/root';
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
  if (!(await isRegisteredApp(db, payload.publicApiKey))) {
    throw error(404, 'Unknown Application');
  }
  exit();
  json(200, { code: 200, message: 'OK' });
  await recordInsightsBeacon(getInsightsDb(), payload);
};

function migrate1(payloadJson: any) {
  // delete payloadJson.sessionID;
  if (!('qVersion' in payloadJson)) {
    payloadJson.qVersion = 'unknown';
  }
}
