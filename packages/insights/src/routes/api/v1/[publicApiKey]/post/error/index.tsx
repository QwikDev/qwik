import { type RequestHandler } from '@qwik.dev/router';
import { recordInsightsError } from '@qwik.dev/core/insights/collector';
import { getDB, getInsightsDb } from '~/db';
import { isRegisteredApp } from '~/db/query';
import { InsightsError } from '~/root';
import { readBoundedJson } from '../read-bounded-json';

const MAX_PAYLOAD_BYTES = 64 * 1024;

export const onPost: RequestHandler = async ({ error, exit, json, request, params }) => {
  const publicApiKey = params.publicApiKey;
  const payloadJson = await readBoundedJson(request, MAX_PAYLOAD_BYTES);
  if (payloadJson === undefined) {
    throw error(413, 'Payload Too Large');
  }
  const payload = InsightsError.parse(payloadJson);
  const db = getDB();
  if (!(await isRegisteredApp(db, publicApiKey))) {
    throw error(404, 'Unknown Application');
  }
  exit();
  json(200, { code: 200, message: 'OK' });
  // Bind the error to the URL key so the body cannot target another application.
  await recordInsightsError(getInsightsDb(), { ...payload, publicApiKey });
};
