import { type RequestHandler } from '@builder.io/qwik-city';
import { getBundleGrouping } from './bundles';
import { getDB } from '../../../../../db';

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
