import type { AnyRecord } from './constants';
import { log } from './constants';
import hookRuntime from '../../virtualmodules/hookRuntime';
import { VNODE_BRIDGE_KEY } from '../../virtualmodules/vnodeBridge';

type MiddlewareNext = (err?: unknown) => void;
type MinimalMiddlewareReq = {
  headers: Record<string, string | string[] | undefined>;
  url?: string;
};
type MinimalMiddlewareRes = {
  write: (...args: any[]) => any;
  end: (...args: any[]) => any;
  setHeader: (name: string, value: any) => void;
};
type ResponseCallback = (error?: Error | null) => void;
type NormalizedBodyArgs = {
  chunk: unknown;
  encoding: BufferEncoding | undefined;
  callback: ResponseCallback | undefined;
};

function normalizeAcceptHeader(raw: string | string[] | undefined): string {
  return Array.isArray(raw) ? raw.join(',') : raw || '';
}

export function attachSsrPerfInjectorMiddleware(server: any) {
  server.middlewares.use(
    (req: MinimalMiddlewareReq, res: MinimalMiddlewareRes, next: MiddlewareNext) => {
      const accept = normalizeAcceptHeader(req.headers.accept);
      if (!accept.includes('text/html')) return next();

      const store = getStoreForSSR() as Record<string, unknown>;
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);
      let body = '';

      const appendChunk = (chunk: unknown, encoding?: BufferEncoding) => {
        if (chunk === undefined || chunk === null || typeof chunk === 'function') {
          return;
        }

        if (typeof chunk === 'string') {
          body += chunk;
          return;
        }

        if (Buffer.isBuffer(chunk)) {
          body += chunk.toString(encoding || 'utf8');
          return;
        }

        if (chunk instanceof ArrayBuffer) {
          body += Buffer.from(chunk).toString(encoding || 'utf8');
          return;
        }

        if (ArrayBuffer.isView(chunk)) {
          body += Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString(
            encoding || 'utf8'
          );
          return;
        }

        body += String(chunk);
      };

      res.write = function (
        chunk: unknown,
        encodingOrCallback?: BufferEncoding | ResponseCallback,
        callback?: ResponseCallback
      ): boolean {
        const args = normalizeBodyArgs(chunk, encodingOrCallback, callback);
        appendChunk(args.chunk, args.encoding);
        args.callback?.();
        return true;
      } as typeof res.write;

      res.end = function (
        chunk?: unknown,
        encodingOrCallback?: BufferEncoding | ResponseCallback,
        callback?: ResponseCallback
      ): typeof res {
        const args = normalizeBodyArgs(chunk, encodingOrCallback, callback);
        appendChunk(args.chunk, args.encoding);

        const nextBody = injectSsrDevtoolsIntoHtml(body, store, req.url);

        try {
          res.setHeader('Content-Length', Buffer.byteLength(nextBody));
        } catch {
          // ignore
        }

        originalWrite(nextBody);

        return originalEnd(args.callback);
      } as typeof res.end;

      next();
    }
  );
}

function normalizeBodyArgs(
  chunk?: unknown,
  encodingOrCallback?: BufferEncoding | ResponseCallback,
  callback?: ResponseCallback
): NormalizedBodyArgs {
  if (typeof chunk === 'function') {
    return {
      chunk: undefined,
      encoding: undefined,
      callback: chunk as ResponseCallback,
    };
  }

  if (typeof encodingOrCallback === 'function') {
    return {
      chunk,
      encoding: undefined,
      callback: encodingOrCallback,
    };
  }

  return {
    chunk,
    encoding: encodingOrCallback,
    callback,
  };
}

function getStoreForSSR(): AnyRecord {
  return typeof process !== 'undefined' && process
    ? (process as unknown as AnyRecord)
    : (globalThis as AnyRecord);
}

type SsrPreloadSnapshotEntry = {
  href: string;
  normalizedHref?: string;
  rel?: string;
  as?: string;
  resourceType?: string;
  source?: string;
  status?: string;
  discoveredAt?: number;
  requestedAt?: number;
  completedAt?: number;
  importDuration?: number;
  loadDuration?: number;
  qrlSymbol?: string;
  qrlRequestedAt?: number;
  loadMatchQuality?: 'best-effort' | 'none';
  matchedBy?: string;
  originKind?: string;
  phase?: 'ssr';
  error?: string;
};

export function extractSsrPreloadEntriesFromHtml(html: string): SsrPreloadSnapshotEntry[] {
  const entries: SsrPreloadSnapshotEntry[] = [];
  const linkRe = /<link\b([^>]*?)>/gi;
  let linkMatch: RegExpExecArray | null;

  while ((linkMatch = linkRe.exec(html)) !== null) {
    const attrs = parseAttributes(linkMatch[1] || '');
    const rel = String(attrs.rel || '').toLowerCase();
    if (!['preload', 'modulepreload', 'prefetch'].includes(rel)) continue;

    const href = String(attrs.href || '').trim();
    if (!href) continue;

    const asValue = String(attrs.as || '').trim();
    entries.push({
      href,
      rel,
      as: asValue,
      resourceType: inferResourceType(rel, asValue, href),
      source: 'initial-dom',
      status: 'pending',
      discoveredAt: 0,
      phase: 'ssr',
      loadMatchQuality: 'none',
      matchedBy: 'none',
    });
  }

  return entries;
}

export function collectSsrPreloadEntries(
  html: string,
  store: Record<string, unknown>
): SsrPreloadSnapshotEntry[] {
  const htmlEntries = extractSsrPreloadEntriesFromHtml(html);
  const rawStoreEntries = Array.isArray(store.__QWIK_SSR_PRELOADS__)
    ? (store.__QWIK_SSR_PRELOADS__ as SsrPreloadSnapshotEntry[])
    : [];

  const merged = new Map<string, SsrPreloadSnapshotEntry>();
  for (const entry of [...htmlEntries, ...rawStoreEntries]) {
    const href = typeof entry.href === 'string' ? entry.href : '';
    const normalizedHref =
      typeof entry.normalizedHref === 'string' && entry.normalizedHref
        ? entry.normalizedHref
        : href;
    const key = normalizedHref;
    merged.set(key, {
      source: 'initial-dom',
      status: 'pending',
      discoveredAt: 0,
      phase: 'ssr',
      loadMatchQuality: 'none',
      matchedBy: 'none',
      ...merged.get(key),
      ...entry,
      href,
    });
  }

  return [...merged.values()];
}

export function injectSsrDevtoolsIntoHtml(
  html: string,
  store: Record<string, unknown>,
  url: string | undefined
): string {
  if (!html.includes('</head>')) {
    return html;
  }

  const rawPerfEntries = store.__QWIK_SSR_PERF__;
  const perfEntries = Array.isArray(rawPerfEntries) ? rawPerfEntries : [];
  const preloadEntries = collectSsrPreloadEntries(html, store);
  log('inject ssr devtools %O', {
    url,
    perfTotal: perfEntries.length,
    preloadTotal: preloadEntries.length,
  });

  const scripts = [
    createHookInjectionScript(),
    perfEntries.length > 0 ? createSsrPerfInjectionScript(perfEntries) : '',
    preloadEntries.length > 0 ? createSsrPreloadInjectionScript(preloadEntries) : '',
  ].join('');

  return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${scripts}`);
}

function createHookInjectionScript(): string {
  return (
    `\n<script type="module">${hookRuntime}</script>` +
    `\n<script type="module" src="/${VNODE_BRIDGE_KEY}"></script>`
  );
}

function createSsrPerfInjectionScript(entries: unknown[]): string {
  const serializedEntries = JSON.stringify(entries);
  return `
<script>
  window.__QWIK_PERF__ = window.__QWIK_PERF__ || { ssr: [], csr: [] };
  window.__QWIK_PERF__.ssr = ${serializedEntries};
  window.dispatchEvent(new CustomEvent('qwik:ssr-perf', { detail: ${serializedEntries} }));
</script>`;
}

function createSsrPreloadInjectionScript(entries: SsrPreloadSnapshotEntry[]): string {
  const serializedEntries = JSON.stringify(entries);
  return `
<script>
  window.__QWIK_SSR_PRELOADS__ = ${serializedEntries};
  window.dispatchEvent(new CustomEvent('qwik:ssr-preloads', { detail: { entries: ${serializedEntries} } }));
</script>`;
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let attrMatch: RegExpExecArray | null;

  while ((attrMatch = attrRe.exec(raw)) !== null) {
    const [, key, dq, sq, bare] = attrMatch;
    attrs[key.toLowerCase()] = dq || sq || bare || '';
  }

  return attrs;
}

function inferResourceType(rel: string, asValue: string, href: string) {
  if (asValue) return asValue;
  if (rel === 'modulepreload') return 'script';
  const cleanHref = href.split('#')[0].split('?')[0];
  const ext = cleanHref.includes('.')
    ? cleanHref.slice(cleanHref.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (['js', 'mjs', 'cjs'].includes(ext)) return 'script';
  if (ext === 'css') return 'style';
  return 'other';
}
