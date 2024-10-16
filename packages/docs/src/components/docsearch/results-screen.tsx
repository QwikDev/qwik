import { component$ } from '@builder.io/qwik';
import { Result } from './result';
import { removeHighlightTags } from './utils';
import { SelectIcon } from './icons/SelectIcon';
import { SourceIcon } from './icons/SourceIcon';
import type { DocSearchState } from './doc-search';

export const ResultsScreen = component$((props: { state: DocSearchState }) => {
  return (
    <div class="DocSearch-Dropdown-Container">
      {props.state.collections.map((collection) => {
        if (collection.items.length === 0) {
          return null;
        }

        const title = removeHighlightTags(collection.items[0]);
        return (
          <section class="DocSearch-Hits" key={title}>
            <div class="DocSearch-Hit-source">{title}</div>

            <ul role="listbox" aria-labelledby="docsearch-label" id="docsearch-list">
              {collection.items.map((item, index) => {
                return (
                  <Result state={props.state} item={item} key={item.objectID}>
                    {item.__docsearch_parent && (
                      <svg q:slot="start-action" class="DocSearch-Hit-Tree" viewBox="0 0 24 54">
                        <g
                          stroke="currentColor"
                          fill="none"
                          fill-rule="evenodd"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          {item.__docsearch_parent !==
                          collection.items[index + 1]?.__docsearch_parent ? (
                            <path d="M8 6v21M20 27H8.3" />
                          ) : (
                            <path d="M8 6v42M20 27H8.3" />
                          )}
                        </g>
                      </svg>
                    )}
                    <div q:slot="start-action" class="DocSearch-Hit-icon">
                      <SourceIcon type={item.type} />
                    </div>
                    <div q:slot="end-action" class="DocSearch-Hit-action">
                      <SelectIcon />
                    </div>
                  </Result>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* {props.resultsFooterComponent && (
        <section class="DocSearch-HitsFooter">
          <props.resultsFooterComponent state={props.state} />
        </section>
      )} */}
    </div>
  );
});
