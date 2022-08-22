import { component$, mutable, Slot, useContext, useStore } from '@builder.io/qwik';
import { SearchContext } from './context';
import type { DocSearchState } from './doc-search';
import { Snippet } from './snippet';
import type { InternalDocSearchHit } from './types';

export const Result = component$(
  ({ state, item }: { state: DocSearchState; item: InternalDocSearchHit }) => {
    const actionStore = useStore({
      isDeleting: false,
      isFavoriting: false,
      action: null,
    } as {
      isDeleting: boolean;
      isFavoriting: boolean;
    });
    const context: any = useContext(SearchContext);

    return (
      <li
        role="option"
        aria-selected={state.activeItemId === item.__autocomplete_id ? 'true' : undefined}
        id={`docsearch-item-${item.__autocomplete_id}`}
        onMouseMove$={() => {
          if (state.activeItemId !== item.__autocomplete_id) {
            state.activeItemId = item.__autocomplete_id;
          }
        }}
        onClick$={(event: MouseEvent) => {
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
        <a href={item.url}>
          <div class="DocSearch-Hit-Container">
            <Slot name="start-action"></Slot>
            {/* @ts-ignore */}
            {item.hierarchy[item.type] && item.type === 'lvl1' && (
              <div class="DocSearch-Hit-content-wrapper">
                <Snippet
                  class="DocSearch-Hit-title"
                  hit={mutable(item)}
                  attribute={mutable('hierarchy.lvl1')}
                />
                {item.content && (
                  <Snippet
                    class="DocSearch-Hit-path"
                    hit={mutable(item)}
                    attribute={mutable('content')}
                  />
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
                  <Snippet
                    class="DocSearch-Hit-title"
                    hit={mutable(item)}
                    attribute={mutable(undefined)}
                  />
                  <Snippet
                    class="DocSearch-Hit-path"
                    hit={mutable(item)}
                    attribute={mutable('hierarchy.lvl1')}
                  />
                </div>
              )}

            {item.type === 'content' && (
              <div class="DocSearch-Hit-content-wrapper">
                <Snippet
                  class="DocSearch-Hit-title"
                  hit={mutable(item)}
                  attribute={mutable('content')}
                />
                <Snippet
                  class="DocSearch-Hit-path"
                  hit={mutable(item)}
                  attribute={mutable('hierarchy.lvl1')}
                />
              </div>
            )}
            <Slot name="end-action"></Slot>
          </div>
        </a>
      </li>
    );
  }
);
