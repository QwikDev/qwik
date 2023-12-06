import { type RequestHandler } from '@builder.io/qwik-city';
import { getDB, errorTable } from '~/db';
import { InsightsError } from '@builder.io/qwik-labs';

export const onPost: RequestHandler = async ({ exit, json, request, params }) => {
  // console.log('API: POST: symbol');
  const publicApiKey = params.publicApiKey;
  const payloadRaw = InsightsError.parse(await request.json());
  const payload = {
    ...payloadRaw,
    timestamp: new Date(payloadRaw.timestamp),
  };
  exit();
  json(200, { code: 200, message: 'OK' });
  // TODO(misko): assert that manifest table has correct row.
  await getDB()
    .insert(errorTable)
    .values({
      publicApiKey,
      ...payload,
    })
    .run();
};
