import { useReportQuery } from '~/components/report-scope/use-report-query';
import { Resource, component$, useResource$, useStore } from '@qwik.dev/core';
import { getRequestEvent, Link, server$, useLocation, type RequestEvent } from '@qwik.dev/router';
import { getDB } from '~/db';
import { loadSymbolSource } from '~/db/source';
import { dbGetInsightUser, type InsightsUser } from '~/db/sql-user';
import { getInsightUser } from '~/routes/app/layout';
import { SymbolIcon } from '../icons/symbol';
import { getReportHref } from '~/report-scope';

type SymbolDetails = {
  fullName?: string | null;
  origin?: string | null;
};

type SymbolPopupProps = SymbolDetails & {
  symbolHash: string;
  manifestHash?: string;
};

export const SymbolPopup = component$<SymbolPopupProps>((props) => (
  <div class="w-full">
    <SymbolSource {...props} />
  </div>
));

export const SymbolSource = component$<SymbolPopupProps>(
  ({ fullName, origin, symbolHash, manifestHash }) => {
    const location = useLocation();
    const hasDetails = hasProvidedSymbolDetails(fullName, origin);
    const state = useStore({
      symbolHash: symbolHash,
      fullName: hasDetails ? displaySymbolDetail(fullName) : '',
      origin: hasDetails ? displaySymbolDetail(origin) : '',
      originUrl: '',
      status: '',
      revision: '',
    });
    const source = useResource$(async ({ track }) => {
      state.symbolHash = track(() => symbolHash);
      const publicApiKey = track(() => location.params.publicApiKey);
      const selectedManifest = track(
        () => manifestHash ?? location.url.searchParams.get('manifest') ?? undefined
      );
      if (state.symbolHash) {
        state.fullName = displaySymbolDetail(fullName);
        state.origin = displaySymbolDetail(origin);
        state.originUrl = '';
        state.status = '';
        state.revision = '';
        const data = await serverGetSourceSnippet(state.symbolHash, publicApiKey, selectedManifest);
        state.fullName = displaySymbolDetail(data.fullName ?? fullName);
        state.origin = displaySymbolDetail(data.origin ?? origin);
        state.originUrl = data.originUrl;
        state.status = data.status;
        state.revision = data.revision;
        return data.source;
      } else {
        return null;
      }
    });
    return (
      <div>
        <h2 class="h5 px-6 py-3">Details</h2>
        <table class="w-full table-fixed text-sm text-left">
          <tbody>
            <tr class="border-y border-slate-200 text-xs">
              <th scope="row" class="w-28 px-6 py-3 bg-slate-50">
                Symbol
              </th>
              <td class="break-words px-6 py-3">
                <code>{symbolHash}</code>
              </td>
            </tr>
            <tr class="border-b border-slate-200 text-xs">
              <th scope="row" class="w-28 px-6 py-3 bg-slate-50">
                Full Name
              </th>
              <td class="break-words px-6 py-3">
                <code>{state.fullName}</code>
              </td>
            </tr>
            <tr class="border-b border-slate-200 text-xs">
              <th scope="row" class="w-28 px-6 py-3 bg-slate-50">
                Origin
              </th>
              <td class="break-words px-6 py-3">
                <code>
                  {state.originUrl ? <a href={state.originUrl}>{state.origin}</a> : state.origin}
                </code>
              </td>
            </tr>
            <Resource
              value={source}
              onPending={() => (
                <tr>
                  <td colSpan={2} class="px-6 py-3 text-xs">
                    Loading source…
                  </td>
                </tr>
              )}
              onRejected={() => (
                <tr>
                  <td colSpan={2} class="px-6 py-3 text-xs">
                    Source could not be loaded. Try opening this symbol again.
                  </td>
                </tr>
              )}
              onResolved={(source) => (
                <tr>
                  <td colSpan={2} class="px-6 py-3 text-xs">
                    {state.revision && (
                      <p class="mb-2">
                        Application source revision: <code>{state.revision}</code>. Confirm it
                        matches this build.
                      </p>
                    )}
                    {source ? (
                      <pre class="max-h-[45vh] max-w-full overflow-auto bg-slate-50 p-3">
                        <span class="text-slate-500">{source.preamble}</span>
                        <mark class="bg-yellow-100">{source.highlight}</mark>
                        <span class="text-slate-500">{source.postamble}</span>
                      </pre>
                    ) : (
                      <p>{sourceStatusMessage(state.status)}</p>
                    )}
                  </td>
                </tr>
              )}
            />
          </tbody>
        </table>
      </div>
    );
  }
);

export const SymbolTile = component$<SymbolDetails & { symbol: string }>(
  ({ fullName, origin, symbol }) => {
    const location = useLocation();
    const reportQuery = useReportQuery();
    return (
      <Link
        class="inline-flex items-center font-editorial-mono text-editorial-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-editorial-accent"
        title={origin ? `${fullName ?? symbol} · ${origin}` : (fullName ?? symbol)}
        href={getReportHref(
          `/app/${location.params.publicApiKey}/symbols/detail/${encodeURIComponent(symbol)}/`,
          reportQuery
        )}
      >
        <SymbolIcon />
        <span class="ml-1">{fullName || symbol}</span>
      </Link>
    );
  }
);

function sourceStatusMessage(status: string): string {
  switch (status) {
    case 'unconfigured':
      return 'Connect a public GitHub repository in Application settings to view source.';
    case 'missing-metadata':
      return 'Source metadata is unavailable for this symbol.';
    case 'invalid-path':
      return 'This source path cannot be resolved in the configured repository.';
    default:
      return 'Source is unavailable at the configured revision. Check the repository, revision, and source directory in Application settings.';
  }
}

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
  requestedPublicApiKey: string,
  manifestHash?: string
) {
  const requestEvent = getRequestEvent(this);
  if (!requestEvent) {
    throw new Error('Missing request context');
  }
  const publicApiKey = await getAuthorizedPublicApiKey(requestEvent, requestedPublicApiKey);
  return manifestHash
    ? loadSymbolSource(getDB(), publicApiKey, symbolHash, undefined, manifestHash)
    : loadSymbolSource(getDB(), publicApiKey, symbolHash);
});
