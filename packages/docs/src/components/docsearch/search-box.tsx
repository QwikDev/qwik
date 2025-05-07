import { component$, useVisibleTask$, useContext, type Signal } from '@builder.io/qwik';

import { MAX_QUERY_SIZE } from './constants';
import { SearchContext } from './context';
import type { DocSearchState } from './doc-search';
import { LoadingIcon } from './icons/LoadingIcon';
import { SearchIcon } from './icons/SearchIcon';

export type SearchBoxTranslations = Partial<{
  resetButtonTitle: string;
  resetButtonAriaLabel: string;
  cancelButtonText: string;
  cancelButtonAriaLabel: string;
}>;

interface SearchBoxProps {
  state: DocSearchState;
  isOpen: Signal<boolean>;
  autoFocus: boolean;
  inputRef: Signal<HTMLInputElement | null>;
}

export const SearchBox = component$((props: SearchBoxProps) => {
  useVisibleTask$(() => {
    if (props.autoFocus) {
      props.inputRef.value?.focus();
    }
  });
  const context = useContext(SearchContext);
  return (
    <>
      <form
        class="DocSearch-Form"
        noValidate={true}
        role="search"
        action=""
        preventdefault:submit
        onReset$={() => {
          props.state.query = '';
          props.state.status = 'idle';
          props.state.activeItemId = null;
        }}
      >
        <label class="DocSearch-MagnifierLabel" for="docsearch-input" id="docsearch-label">
          <SearchIcon />
        </label>

        <div class="DocSearch-LoadingIndicator">
          <LoadingIcon />
        </div>

        <input
          class="DocSearch-Input"
          aria-autocomplete="both"
          aria-control="docsearch-list"
          aria-labelledby="docsearch-label"
          value={props.state.query}
          id="docsearch-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          maxLength={MAX_QUERY_SIZE}
          enterKeyHint={props.state.activeItemId ? 'go' : 'search'}
          spellcheck={false}
          autoFocus={props.autoFocus}
          placeholder="Search docs"
          type="search"
          ref={props.inputRef as any}
          onInput$={(event) => {
            context.onInput?.(event);
          }}
          // TODO: preventdefault:keydown by key's condition
          onKeyDown$={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              const nextActiveId = getNextActiveItemId(
                event.key === 'ArrowUp' ? -1 : 1,
                props.state.activeItemId,
                getItemsCount(props.state),
                null
              );
              if (nextActiveId !== props.state.activeItemId) {
                props.state.activeItemId = nextActiveId;
                // scroll to if necessary
                if (typeof document !== 'undefined') {
                  const nodeItem = document.getElementById(
                    `docsearch-item-${props.state.activeItemId}`
                  );
                  if (nodeItem) {
                    if ((nodeItem as any).scrollIntoViewIfNeeded) {
                      (nodeItem as any).scrollIntoViewIfNeeded(false);
                    } else {
                      nodeItem.scrollIntoView(false);
                    }
                  }
                }
              }
            }
            if (event.key === 'Escape') {
              props.isOpen.value = false;
            }
            if (event.key === 'Enter') {
              if (props.state.activeItemId !== null) {
                const id = `docsearch-item-${props.state.activeItemId}`;
                const element = document.querySelector(`#${id} a, #${id} button`) as HTMLElement;
                if (element) {
                  element.click();
                }
              }
            }
          }}
          onFocus$={(e) => {
            // noop
          }}
          onClick$={(e) => {
            // noop
          }}
        />
      </form>

      <button
        class="DocSearch-Cancel"
        type="reset"
        aria-label="Cancel"
        onClick$={() => (props.isOpen.value = false)}
      >
        Cancel
      </button>
    </>
  );
});

export function getNextActiveItemId(
  moveAmount: number,
  baseIndex: number | null,
  itemCount: number,
  defaultActiveItemId: number | null
) {
  if (!itemCount) {
    return null;
  }

  if (
    moveAmount < 0 &&
    (baseIndex === null || (defaultActiveItemId !== null && baseIndex === -1))
  ) {
    return itemCount + moveAmount;
  }

  const numericIndex = (baseIndex === null ? -2 : baseIndex) + moveAmount;

  if (numericIndex <= -2 || numericIndex >= itemCount) {
    return defaultActiveItemId === null ? null : -1;
  }

  return numericIndex;
}
export function getItemsCount(state: DocSearchState) {
  if (state.collections.length === 0) {
    return 0;
  }

  return state.collections.reduce(function (sum, collection) {
    return sum + collection.items.length;
  }, 0);
}
