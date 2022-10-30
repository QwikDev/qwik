import type { SearchClient } from 'algoliasearch/lite';
import { component$, useStore, useStyles$, useRef } from '@builder.io/qwik';
import type { DocSearchHit, InternalDocSearchHit, StoredDocSearchHit } from './types';
import { ButtonTranslations, DocSearchButton } from './doc-search-button';
import { DocSearchModal, ModalTranslations } from './doc-search-modal';
import styles from './doc-search.css?inline';
import type { StoredSearchPlugin } from './stored-searches';
import type { QwikKeyboardEvent } from 'packages/qwik/src/core/render/jsx/types/jsx-qwik-events';

export type DocSearchTranslations = Partial<{
  button: ButtonTranslations;
  modal: ModalTranslations;
}>;

export type DocSearchState = {
  isOpen: boolean;
  query: string;
  collections: {
    items: InternalDocSearchHit[];
  }[];
  context: {
    searchSuggestions: string[];
  };
  activeItemId: null | number;
  snippetLength: number;
  status: 'idle' | 'loading' | 'stalled' | 'error';
  initialQuery?: string;
  favoriteSearches?: StoredSearchPlugin<StoredDocSearchHit>;
  recentSearches?: StoredSearchPlugin<StoredDocSearchHit>;
};

export interface DocSearchProps {
  appId: string;
  apiKey: string;
  indexName: string;
  transformItems$?: (items: DocSearchHit[]) => DocSearchHit[];
  transformSearchClient?: (searchClient: SearchClient) => SearchClient;
  disableUserPersonalization?: boolean;
  translations?: DocSearchTranslations;
}

export function isEditingContent(event: QwikKeyboardEvent<HTMLElement>): boolean {
  const { isContentEditable, tagName } = event.target;

  return isContentEditable || tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA';
}

export const DocSearch = component$((props: DocSearchProps) => {
  useStyles$(styles);
  // useContextBoundary();

  const state = useStore<DocSearchState>({
    isOpen: false,
    initialQuery: '',
    favoriteSearches: null as any,
    recentSearches: null as any,
    query: '',
    collections: [],
    context: {
      searchSuggestions: [],
    },
    activeItemId: null,
    status: 'idle',
    snippetLength: 10,
  });

  const searchButtonRef = useRef();

  return (
    <div
      class="docsearch"
      window:onKeyDown$={(event) => {
        function open() {
          // We check that no other DocSearch modal is showing before opening
          // another one.
          if (!document.body.classList.contains('DocSearch--active')) {
            state.isOpen = true;
          }
        }
        if (
          (event.key === 'Escape' && state.isOpen) ||
          // The `Cmd+K` shortcut both opens and closes the modal.
          (event.key === 'k' && (event.metaKey || event.ctrlKey)) ||
          // The `/` shortcut opens but doesn't close the modal because it's
          // a character.
          (!isEditingContent(event) && event.key === '/' && !state.isOpen)
        ) {
          // FIXME: not able to prevent
          // event.preventDefault();

          if (state.isOpen) {
            state.isOpen = false;
          } else if (!document.body.classList.contains('DocSearch--active')) {
            open();
          }
        }

        if (searchButtonRef && searchButtonRef.current === document.activeElement) {
          if (/[a-zA-Z0-9]/.test(String.fromCharCode(event.keyCode))) {
            state.isOpen = true;
            state.initialQuery = event.key;
          }
        }
      }}
    >
      <DocSearchButton
        ref={searchButtonRef}
        onClick$={() => {
          state.isOpen = true;
        }}
      />
      {state.isOpen && (
        <DocSearchModal
          {...props}
          state={state}
          onClose$={() => {
            state.isOpen = false;
          }}
        />
      )}
    </div>
  );
});
