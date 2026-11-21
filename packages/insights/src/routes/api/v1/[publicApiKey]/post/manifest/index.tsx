import { type RequestHandler } from '@qwik.dev/router';
import { recordInsightsSymbols } from '@qwik.dev/core/insights/collector';
import { getDB, getInsightsDb } from '~/db';
import { isRegisteredApp } from '~/db/query';
import { QManifest } from '~/types/q-manifest';
import { readBoundedJson } from '../read-bounded-json';

const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
const MAX_MANIFEST_SYMBOLS = 10_000;

export const onPost: RequestHandler = async ({ error, exit, json, request, params }) => {
  const publicApiKey = params.publicApiKey;
  const db = getDB();
  if (!(await isRegisteredApp(db, publicApiKey))) {
    throw error(404, 'Unknown Application');
  }
  const manifestJson = await readBoundedJson(request, MAX_MANIFEST_BYTES);
  if (manifestJson === undefined) {
    throw error(413, 'Payload Too Large');
  }
  const qManifest = QManifest.parse(manifestJson);
  if (Object.keys(qManifest.symbols).length > MAX_MANIFEST_SYMBOLS) {
    throw error(413, 'Too Many Symbols');
  }
  try {
    exit();
    await recordInsightsSymbols(
      getInsightsDb(),
      publicApiKey,
      qManifest.manifestHash,
      Object.values(qManifest.symbols)
    );
    json(200, { code: 200, message: 'OK' });
  } catch (e) {
    console.error(JSON.stringify(e));
    json(500, { code: 500, message: 'Internal Server Error', error: e });
  }
};
