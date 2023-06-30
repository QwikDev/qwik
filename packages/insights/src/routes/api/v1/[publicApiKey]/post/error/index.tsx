import { type RequestHandler } from '@builder.io/qwik-city';
import { InsightsError } from '@builder.io/qwik-labs';
import { errorTable, getDB } from '~/db';

export const onPost: RequestHandler = async ({ exit, json, request, params }) => {
  // console.log('API: POST: symbol');
  const publicApiKey = params.publicApiKey;
  const payload = InsightsError.parse(await request.json());
  exit();
  json(200, { code: 200, message: 'OK' });
  const db = getDB();
  await db
    .insert(errorTable)
    .values({
      publicApiKey,
      ...payload,
    })
    .run();
};
