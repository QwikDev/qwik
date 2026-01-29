import { Resource, component$, useResource$, useStore } from '@builder.io/qwik';
import { server$, useLocation } from '@builder.io/qwik-city';
import { and, eq } from 'drizzle-orm';
import { getDB, symbolDetailTable } from '~/db';
import { SymbolIcon } from '../icons/symbol';
import { type PopupEvent } from '../popup-manager';

export const SymbolPopup = component$<{ symbolHash: string }>(({ symbolHash }) => (
  <div class="min-w-[500px] max-w-[75vw]">
    <SymbolSource symbolHash={symbolHash} />
  </div>
));

export const SymbolSource = component$<{ symbolHash: string }>(({ symbolHash }) => {
  const location = useLocation();
  const state = useStore({
    symbolHash: symbolHash,
    fullName: '',
    origin: '',
    originUrl: '',
    lo: 0,
    hi: 0,
  });
  const source = useResource$(async ({ track }) => {
    state.symbolHash = track(() => symbolHash);
    if (state.symbolHash) {
      state.fullName = '...';
      state.origin = '...';
      const data = await serverGetSourceSnippet(location.params.publicApiKey, state.symbolHash);
      state.fullName = data.fullName;
      state.origin = data.origin;
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
          <tr>
            <td colSpan={2} class="px-6 py-3 text-xs">
              <Resource
                value={source}
                onPending={() => <div>loading...</div>}
                onResolved={(source) => (
                  <div>
                    <pre>{source.preamble}</pre>
                    <pre>{source.highlight}</pre>
                    <pre>{source.postamble}</pre>
                  </div>
                )}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});

export const SymbolTile = component$<{ symbol: string }>(({ symbol }) => {
  return (
    <code onPopup$={(e: PopupEvent) => e.detail.show(SymbolPopup, { symbolHash: symbol })}>
      <SymbolIcon />
      <span class="ml-1">{symbol}</span>
    </code>
  );
});

const serverGetSourceSnippet = server$(async function (publicApiKey: string, symbolHash: string) {
  const db = getDB();
  let [symbolDetail] = await Promise.all([
    db
      .select({
        fullName: symbolDetailTable.fullName,
        origin: symbolDetailTable.origin,
        lo: symbolDetailTable.lo,
        hi: symbolDetailTable.hi,
      })
      .from(symbolDetailTable)
      .where(
        and(
          //
          eq(symbolDetailTable.publicApiKey, publicApiKey),
          eq(symbolDetailTable.hash, symbolHash)
        )
      )
      .get(),
  ]);
  if (!symbolDetail) {
    symbolDetail = {
      fullName: 'unknown',
      origin: 'unknown',
      lo: 0,
      hi: 0,
    };
  }
  let source = '...';
  let url: URL | null = null;
  let rawUrl: URL | null = null;
  if (publicApiKey == '221smyuj5gl') {
    const rawGithub = 'https://raw.githubusercontent.com/QwikDev/qwik/main/packages/docs/src/';
    const github = 'https://github.com/QwikDev/qwik/blob/main/packages/docs/src/';
    rawUrl = new URL(rawGithub);
    url = new URL(github);
    if (symbolDetail.origin.startsWith('./')) {
      console.log('ORIGIN:', symbolDetail.origin);
    } else {
      rawUrl.pathname += symbolDetail.origin;
      url.pathname += symbolDetail.origin;
      const rawSource = await (await fetch(rawUrl.toString())).text();
      source = rawSource;
    }
  }
  return {
    fullName: symbolDetail.fullName,
    origin: symbolDetail.origin,
    originUrl: url ? url.toString() : '',
    source: codeHighlight(source, symbolDetail.lo, symbolDetail.hi),
  };
});

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
