import { type RequestHandler } from '@builder.io/qwik-city';
import { getDB } from '../../../../../db';
import { getBundleGrouping } from './chunks';

export const onGet: RequestHandler = async ({ exit, json, params }) => {
  json(
    200,
    await getBundleGrouping({
      publicApiKey: params.publicApiKey,
      db: getDB(),
    })
  );
  exit();
};
