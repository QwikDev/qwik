import { Resource, component$, useResource$, useStore } from '@qwik.dev/core';
import { getRequestEvent, server$, useLocation, type RequestEvent } from '@qwik.dev/router';
import { and, eq } from 'drizzle-orm';
import { getDB, symbolDetailTable } from '~/db';
import { dbGetInsightUser, type InsightsUser } from '~/db/sql-user';
import { getInsightUser } from '~/routes/app/layout';
import { SymbolIcon } from '../icons/symbol';
import { type PopupEvent } from '../popup-manager';

type SymbolDetails = {
  fullName?: string | null;
  origin?: string | null;
};

type SymbolPopupProps = SymbolDetails & {
  symbolHash: string;
};

export const SymbolPopup = component$<SymbolPopupProps>((props) => (
  <div class="min-w-[500px] max-w-[75vw]">
    <SymbolSource {...props} />
  </div>
));

export const SymbolSource = component$<SymbolPopupProps>(({ fullName, origin, symbolHash }) => {
  const location = useLocation();
  const hasDetails = hasProvidedSymbolDetails(fullName, origin);
  const state = useStore({
    symbolHash: symbolHash,
    fullName: hasDetails ? displaySymbolDetail(fullName) : '',
    origin: hasDetails ? displaySymbolDetail(origin) : '',
    originUrl: '',
  });
  const source = useResource$(async ({ track }) => {
    state.symbolHash = track(() => symbolHash);
    const publicApiKey = track(() => location.params.publicApiKey);
    if (hasDetails) {
      return null;
    }
    if (state.symbolHash) {
      state.fullName = '...';
      state.origin = '...';
      const data = await serverGetSourceSnippet(state.symbolHash, publicApiKey);
      state.fullName = displaySymbolDetail(data.fullName);
      state.origin = displaySymbolDetail(data.origin);
      state.originUrl = data.originUrl;
      return data.source;
    } else {
      return { preamble: '', highlight: '', postamble: '' };
    }
  });
  return (
    <div>
      <h2 class="h5 px-6 py-3">Details</h2>
      <table class="w-full text-sm text-left">
        <tbody>
          <tr class="border-y border-slate-200 text-xs">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Symbol
            </th>
            <td scope="col" class="px-6 py-3">
              <code>{symbolHash}</code>
            </td>
          </tr>
          <tr class="border-b border-slate-200 text-xs">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Full Name
            </th>
            <td scope="col" class="px-6 py-3">
              <code>{state.fullName}</code>
            </td>
          </tr>
          <tr class="border-b border-slate-200 text-xs">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Origin
            </th>
            <td scope="col" class="px-6 py-3">
              <code>
                {state.originUrl ? <a href={state.originUrl}>{state.origin}</a> : state.origin}
              </code>
            </td>
          </tr>
          <Resource
            value={source}
            onPending={() =>
              hasDetails ? null : (
                <tr>
                  <td colSpan={2} class="px-6 py-3 text-xs">
                    loading...
                  </td>
                </tr>
              )
            }
            onRejected={() => null}
            onResolved={(source) =>
              source ? (
                <tr>
                  <td colSpan={2} class="px-6 py-3 text-xs">
                    <div>
                      <pre>{source.preamble}</pre>
                      <pre>{source.highlight}</pre>
                      <pre>{source.postamble}</pre>
                    </div>
                  </td>
                </tr>
              ) : null
            }
          />
        </tbody>
      </table>
    </div>
  );
});

export const SymbolTile = component$<SymbolDetails & { symbol: string }>(
  ({ fullName, origin, symbol }) => {
    return (
      <code
        onPopup$={(e: PopupEvent) =>
          e.detail.show(SymbolPopup, { fullName, origin, symbolHash: symbol })
        }
      >
        <SymbolIcon />
        <span class="ml-1">{symbol}</span>
      </code>
    );
  }
);

export function hasProvidedSymbolDetails(
  fullName: string | null | undefined,
  origin: string | null | undefined
): boolean {
  return fullName !== undefined || origin !== undefined;
}

export function displaySymbolDetail(value: string | null | undefined): string {
  return value || 'Metadata unavailable';
}

type LoadInsightsUser = (email: string) => Promise<InsightsUser>;

export async function getAuthorizedPublicApiKey(
  requestEvent: Pick<RequestEvent, 'params' | 'sharedMap' | 'error'>,
  requestedPublicApiKey = requestEvent.params.publicApiKey,
  loadUser: LoadInsightsUser = dbGetInsightUser
): Promise<string> {
  const session = requestEvent.sharedMap.get('session') as
    | { user?: { email?: string | null } }
    | undefined;
  const email = session?.user?.email;
  const insightUser =
    (getInsightUser(requestEvent.sharedMap) as InsightsUser | undefined) ??
    (email ? await loadUser(email) : undefined);
  if (!requestedPublicApiKey || !insightUser?.isAuthorizedForApp(requestedPublicApiKey)) {
    throw requestEvent.error(403, 'Forbidden');
  }
  return requestedPublicApiKey;
}

const serverGetSourceSnippet = server$(async function (
  symbolHash: string,
  requestedPublicApiKey: string
) {
  const requestEvent = getRequestEvent(this);
  if (!requestEvent) {
    throw new Error('Missing request context');
  }
  const publicApiKey = await getAuthorizedPublicApiKey(requestEvent, requestedPublicApiKey);
  const db = getDB();
  const symbolDetail = await db
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
  if (!symbolDetail) {
    return {
      fullName: null,
      origin: null,
      originUrl: '',
      source: null,
    };
  }
  let source: ReturnType<typeof codeHighlight> | null = null;
  let url: URL | null = null;
  if (publicApiKey === '221smyuj5gl' && !symbolDetail.origin.startsWith('./')) {
    const rawGithub = 'https://raw.githubusercontent.com/QwikDev/qwik/main/packages/docs/src/';
    const github = 'https://github.com/QwikDev/qwik/blob/main/packages/docs/src/';
    const rawUrl = new URL(rawGithub);
    url = new URL(github);
    rawUrl.pathname += symbolDetail.origin;
    url.pathname += symbolDetail.origin;
    const rawSource = await fetchSourceText(rawUrl.toString());
    if (rawSource !== null) {
      source = codeHighlight(rawSource, symbolDetail.lo, symbolDetail.hi);
    }
  }
  return {
    fullName: symbolDetail.fullName,
    origin: symbolDetail.origin,
    originUrl: url ? url.toString() : '',
    source,
  };
});

type SourceFetcher = (
  input: string,
  init?: RequestInit
) => Promise<{ ok: boolean; text(): Promise<string> }>;

export async function fetchSourceText(
  url: string,
  fetchSource: SourceFetcher = fetch
): Promise<string | null> {
  try {
    const response = await fetchSource(url, { signal: AbortSignal.timeout(3_000) });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

function codeHighlight(
  code: string,
  lo: number,
  hi: number
): { preamble: string; highlight: string; postamble: string } {
  const pre = code.substring(0, lo - 1);
  let preNlIdx = pre.lastIndexOf('\n', pre.length - 1);
  preNlIdx = pre.lastIndexOf('\n', preNlIdx - 1);
  preNlIdx = pre.lastIndexOf('\n', preNlIdx - 1);
  const highlight = code.substring(lo - 1, hi - 1);
  const post = code.substring(hi - 1);
  let postNlIdx = post.indexOf('\n', 1);
  postNlIdx = post.indexOf('\n', postNlIdx + 1);
  postNlIdx = post.indexOf('\n', postNlIdx + 1);
  return {
    preamble: pre.substring(preNlIdx + 1),
    highlight,
    postamble: post.substring(0, postNlIdx),
  };
}
