import { type RequestHandler } from '@qwik.dev/router';
import { getDB } from '~/db';
import { saveSymbolMetadata } from '~/db/symbol-metadata';
import { isRegisteredApp } from '~/db/query';
import { dbGetManifestInfo } from '~/db/sql-manifest';
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
    const manifestHash = qManifest.manifestHash;
    exit();
    await dbGetManifestInfo(db, publicApiKey, manifestHash);
    await saveSymbolMetadata(
      db,
      publicApiKey,
      manifestHash,
      Object.values(qManifest.symbols).map((symbol) => ({
        hash: symbol.hash,
        fullName: symbol.displayName,
        origin: symbol.origin,
        lo: symbol.loc[0],
        hi: symbol.loc[1],
      }))
    );
    json(200, { code: 200, message: 'OK' });
  } catch (e) {
    console.error(JSON.stringify(e));
    json(500, { code: 500, message: 'Internal Server Error', error: e });
  }
};
