import {
  $,
  Resource,
  Slot,
  component$,
  createContextId,
  useContext,
  useContextProvider,
  useResource$,
  useStore,
  type ContextId,
  type QwikMouseEvent,
} from '@builder.io/qwik';
import { server$, useLocation } from '@builder.io/qwik-city';
import { and, eq } from 'drizzle-orm';
import { getDB, symbolDetailTable } from '~/db';
import { css } from '~/styled-system/css';
import { SymbolIcon } from '../icons/symbol';

const symbolHoverContext = createContextId<{
  visible: boolean;
  symbolHash: string;
  x: number;
  y: number;
}>('SymbolHoverContext');

export const SymbolProvider = component$(() => {
  const symbolHover = useStore<typeof symbolHoverContext extends ContextId<infer T> ? T : unknown>({
    visible: false,
    symbolHash: '',
    x: 0,
    y: 0,
  });
  useContextProvider(symbolHoverContext, symbolHover);
  return (
    <>
      <Slot />
      <div
        style={{
          display: symbolHover.visible ? 'block' : 'none',
          top: symbolHover.y + 4 + 'px',
          left: symbolHover.x + 4 + 'px',
        }}
        class={css({
          display: 'none',
          position: 'fixed',
          background: 'white',
          border: '1px solid black',
          borderRadius: '8px',
          padding: '5px',
          width: '50vw',
          height: '50vh',
          overflow: 'scroll',
        })}
      >
        <button
          class={css({
            float: 'right',
            padding: '2px 4px',
            cursor: 'pointer',
          })}
          onClick$={() => (symbolHover.visible = false)}
        >
          ❌
        </button>
        <h1
          class={css({
            fontWeight: 'bold',
            fontSize: '14px',
          })}
        >
          Symbol:{' '}
          <code
            class={css({
              fontFamily: 'monospace',
              fontWeight: 'bold',
              fontSize: '14px',
              padding: '2px 4px',
              backgroundColor: '#EEE',
              border: '1px solid #CCC',
              borderRadius: '5px',
            })}
          >
            {symbolHover.symbolHash}
          </code>
        </h1>
        <div
          class={css({
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
          })}
        >
          <SymbolSource symbolHash={symbolHover.symbolHash} />
        </div>
      </div>
    </>
  );
});

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
    <div class={css({})}>
      <h1
        class={css({
          fontWeight: 'bold',
          fontSize: '14px',
        })}
      >
        {'Full name: '}
        <code
          class={css({
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '14px',
            padding: '2px 4px',
          })}
        >
          {state.fullName}
        </code>
      </h1>
      <h1
        class={css({
          fontWeight: 'bold',
          fontSize: '14px',
        })}
      >
        {'Origin: '}
        <code
          class={css({
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: '14px',
            padding: '2px 4px',
          })}
        >
          {state.originUrl ? <a href={state.originUrl}>{state.origin}</a> : state.origin}
        </code>
      </h1>
      <Resource
        value={source}
        onPending={() => <div>loading...</div>}
        onResolved={(source) => (
          <div
            class={css({
              color: '#888',
              fontFamily: 'monospace',
              fontSize: '14px',
            })}
          >
            <pre class={css({ display: 'inline' })}>{source.preamble}</pre>
            <pre
              class={css({
                color: '#000',
                display: 'inline',
                fontWeight: 'bold',
              })}
            >
              {source.highlight}
            </pre>
            <pre class={css({ display: 'inline' })}>{source.postamble}</pre>
          </div>
        )}
      />
    </div>
  );
});

export const SymbolCmp = component$<{ symbol: string }>(({ symbol }) => {
  const symbolHover = useContext(symbolHoverContext);
  const onMouseMove = $((event: QwikMouseEvent) => {
    if (event.shiftKey) return;
    symbolHover.x = event.clientX;
    symbolHover.y = event.clientY;
  });
  return (
    <code
      onMouseEnter$={async (e, target) => {
        symbolHover.visible = true;
        symbolHover.symbolHash = target.textContent!;
        await onMouseMove(e);
      }}
      onMouseLeave$={(event) => {
        if (event.shiftKey) return;
        symbolHover.visible = false;
      }}
      onMouseMove$={onMouseMove}
      class={css({
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fontSize: '14px',
        padding: '2px 4px',
        backgroundColor: '#EEE',
        border: '1px solid #CCC',
        borderRadius: '5px',
        whiteSpace: 'nowrap',
      })}
    >
      <SymbolIcon
        class={css({ display: 'inline-block', marginBottom: '1px', marginRight: '2px' })}
      />
      {symbol}
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
  if (!(symbolDetail as any)) {
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
    const rawGithub = 'https://raw.githubusercontent.com/BuilderIO/qwik/main/packages/docs/src/';
    const github = 'https://github.com/BuilderIO/qwik/blob/main/packages/docs/src/';
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
