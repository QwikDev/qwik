import { and, eq } from 'drizzle-orm';
import { applicationSourceTable, symbolDetailTable, type AppDatabase } from '.';
import { SourceSettings, sourceUrls } from '../source-repository';

export function getSourceSettings(db: AppDatabase, publicApiKey: string) {
  return db
    .select({
      repository: applicationSourceTable.repository,
      revision: applicationSourceTable.revision,
      sourceRoot: applicationSourceTable.sourceRoot,
    })
    .from(applicationSourceTable)
    .where(eq(applicationSourceTable.publicApiKey, publicApiKey))
    .get();
}

export async function saveSourceSettings(
  db: AppDatabase,
  publicApiKey: string,
  settings: SourceSettings
) {
  const parsed = SourceSettings.parse(settings);
  if (!parsed.repository) {
    await db
      .delete(applicationSourceTable)
      .where(eq(applicationSourceTable.publicApiKey, publicApiKey))
      .run();
    return;
  }
  await db
    .insert(applicationSourceTable)
    .values({ publicApiKey, ...parsed })
    .onConflictDoUpdate({
      target: applicationSourceTable.publicApiKey,
      set: parsed,
    })
    .run();
}

export async function loadSymbolSource(
  db: AppDatabase,
  publicApiKey: string,
  symbolHash: string,
  fetchSource: typeof fetch = fetch
) {
  const symbol = await db
    .select({
      fullName: symbolDetailTable.fullName,
      origin: symbolDetailTable.origin,
      lo: symbolDetailTable.lo,
      hi: symbolDetailTable.hi,
    })
    .from(symbolDetailTable)
    .where(
      and(eq(symbolDetailTable.publicApiKey, publicApiKey), eq(symbolDetailTable.hash, symbolHash))
    )
    .get();
  const result = {
    fullName: symbol?.fullName ?? null,
    origin: symbol?.origin ?? null,
    originUrl: '',
    revision: '',
    source: null as ReturnType<typeof codeHighlight> | null,
    status: 'missing-metadata',
  };
  if (!symbol) {
    return result;
  }
  const settings = await getSourceSettings(db, publicApiKey);
  if (!settings) {
    return { ...result, status: 'unconfigured' };
  }
  const urls = sourceUrls(settings, symbol.origin);
  if (!urls) {
    return { ...result, status: 'invalid-path' };
  }
  const code = await fetchSourceText(urls.raw, fetchSource);
  return {
    ...result,
    originUrl: urls.browser,
    revision: settings.revision,
    source: code === null ? null : codeHighlight(code, symbol.lo, symbol.hi),
    status: code === null ? 'unavailable' : 'loaded',
  };
}

export async function fetchSourceText(
  url: string,
  fetchSource: typeof fetch = fetch
): Promise<string | null> {
  try {
    const response = await fetchSource(url, {
      signal: AbortSignal.timeout(3_000),
      redirect: 'error',
    });
    if (!response.ok || !response.body) {
      return null;
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      // Stream limits protect the Worker from oversized repository files.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        length += value.length;
        if (length > 1_048_576) {
          return null;
        }
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function codeHighlight(code: string, lo: number, hi: number) {
  const pre = code.substring(0, lo - 1);
  const post = code.substring(hi - 1);
  return {
    preamble: pre.split('\n').slice(-3).join('\n'),
    highlight: code.substring(lo - 1, hi - 1),
    postamble: post.split('\n').slice(0, 3).join('\n'),
  };
}
