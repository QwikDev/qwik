import { Slot, component$, useContext, useSignal, useStore, useTask$ } from '@builder.io/qwik';
// import { QwikGPT } from '../qwik-gpt';
import { SearchContext } from './context';
import { AiResultOpenContext, type DocSearchState } from './doc-search';
import { Snippet } from './snippet';
import type { InternalDocSearchHit } from './types';
import { Link } from '@builder.io/qwik-city';

export const Result = component$(
  ({ state, item }: { state: DocSearchState; item: InternalDocSearchHit }) => {
    const actionStore = useStore({
      isDeleting: false,
      isFavoriting: false,
      action: null,
    });
    const context: any = useContext(SearchContext);

    return (
      <li
        role="option"
        aria-selected={state.activeItemId === item.__autocomplete_id ? 'true' : undefined}
        id={`docsearch-item-${item.__autocomplete_id}`}
        onMouseOver$={() => {
          if (state.activeItemId !== item.__autocomplete_id) {
            state.activeItemId = item.__autocomplete_id;
          }
        }}
        onClick$={(event) => {
          const searchList = [
            event.target,
            // @ts-ignore
            event.target?.parentElement,
            // @ts-ignore
            event.target?.parentElement.parentElement,
          ];
          if (searchList.some((el) => el?.hasAttribute?.('preventdefault:click'))) {
            return;
          }
          context.onSelectItem({
            item,
            event,
          });
        }}
        class={[
          'DocSearch-Hit',
          (item as unknown as InternalDocSearchHit).__docsearch_parent && 'DocSearch-Hit--Child',
          actionStore.isDeleting && 'DocSearch-Hit--deleting',
          actionStore.isFavoriting && 'DocSearch-Hit--favoriting',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Link
          href={item.url.replace('https://qwik.dev/', '/').replace('https://qwik.builder.io/', '/')}
        >
          <div class="DocSearch-Hit-Container">
            <Slot name="start-action"></Slot>
            {/* @ts-ignore */}
            {item.hierarchy[item.type] && item.type === 'lvl1' && (
              <div class="DocSearch-Hit-content-wrapper">
                <Snippet
                  class="DocSearch-Hit-title"
                  hit={item}
                  attribute={'hierarchy.lvl1'}
                  key="s--1"
                />
                {item.content && (
                  <Snippet class="DocSearch-Hit-path" hit={item} attribute={'content'} key="s-0" />
                )}
              </div>
            )}

            {/* @ts-ignore */}
            {item.hierarchy[item.type] &&
              (item.type === 'lvl2' ||
                item.type === 'lvl3' ||
                item.type === 'lvl4' ||
                item.type === 'lvl5' ||
                item.type === 'lvl6') && (
                <div class="DocSearch-Hit-content-wrapper">
                  <Snippet class="DocSearch-Hit-title" hit={item} attribute={undefined} key="s-1" />
                  <Snippet
                    class="DocSearch-Hit-path"
                    hit={item}
                    attribute={'hierarchy.lvl1'}
                    key="s-2"
                  />
                </div>
              )}

            {item.type === 'content' && (
              <div class="DocSearch-Hit-content-wrapper">
                <Snippet class="DocSearch-Hit-title" hit={item} attribute={'content'} key="s-3" />
                <Snippet
                  class="DocSearch-Hit-path"
                  hit={item}
                  attribute={'hierarchy.lvl1'}
                  key="s-4"
                />
              </div>
            )}
            <Slot name="end-action"></Slot>
          </div>
        </Link>
      </li>
    );
  }
);

export const AIButton = component$(({ state }: { state: DocSearchState }) => {
  const gpt = useSignal<string>();
  const aiResultOpen = useContext(AiResultOpenContext);

  useTask$(({ track }) => {
    aiResultOpen.value = Boolean(track(() => gpt.value?.trim()));
  });

  useTask$(({ track }) => {
    // When query changes, reset gpt value
    track(() => state.query);
    gpt.value = '';
  });

  const ai = -1;
  return (
    <>
      {state.query.length > 3 && (
        <li
          role="option"
          style={{ 'margin-top': '10px' }}
          id={`docsearch-item-${ai}`}
          aria-selected={state.activeItemId === ai ? 'true' : undefined}
          class="ai-li"
          onMouseOver$={() => {
            if (state.activeItemId !== ai) {
              state.activeItemId = ai;
            }
          }}
        >
          {/* <div class="ai-button">
            <button
              onClick$={() => {
                gpt.value = state.query;
              }}
            >
              <span>
                🤖 Ask QwikAI (beta)
                {state.query === '' ? (
                  '...'
                ) : (
                  <>
                    {': '}
                    <strong>{state.query}</strong>
                  </>
                )}
              </span>
            </button>
            {gpt.value && (
              <div class="qwikgpt-box">
                <QwikGPT query={gpt.value}></QwikGPT>
              </div>
            )}
          </div> */}
        </li>
      )}
    </>
  );
});
