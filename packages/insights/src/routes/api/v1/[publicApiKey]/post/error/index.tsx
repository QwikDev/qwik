import { type RequestHandler } from '@builder.io/qwik-city';
import { InsightsError } from '@builder.io/qwik-labs';
import { errorTable, getDB } from '~/db';
import { isRegisteredApp } from '~/db/query';
import { readBoundedJson } from '../read-bounded-json';

const MAX_PAYLOAD_BYTES = 64 * 1024;

export const onPost: RequestHandler = async ({ error, exit, json, request, params }) => {
  // console.log('API: POST: symbol');
  const publicApiKey = params.publicApiKey;
  const payloadJson = await readBoundedJson(request, MAX_PAYLOAD_BYTES);
  if (payloadJson === undefined) {
    throw error(413, 'Payload Too Large');
  }
  const payloadRaw = InsightsError.parse(payloadJson);
  const payload = {
    ...payloadRaw,
    timestamp: new Date(payloadRaw.timestamp),
  };
  const db = getDB();
  if (!(await isRegisteredApp(db, publicApiKey))) {
    throw error(404, 'Unknown Application');
  }
  exit();
  json(200, { code: 200, message: 'OK' });
  // TODO(misko): assert that manifest table has correct row.
  await db
    .insert(errorTable)
    .values({
      publicApiKey,
      ...payload,
    })
    .run();
};
