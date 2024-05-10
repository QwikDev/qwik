import type { SearchClient } from 'algoliasearch/lite';
import {
  component$,
  useStore,
  useStyles$,
  useSignal,
  createContextId,
  useContextProvider,
  type Signal,
} from '@builder.io/qwik';
import type { DocSearchHit, InternalDocSearchHit } from './types';
import { type ButtonTranslations, DocSearchButton } from './doc-search-button';
import { DocSearchModal, type ModalTranslations } from './doc-search-modal';
import styles from './doc-search.css?inline';

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

export function isEditingContent(event: KeyboardEvent): boolean {
  const { isContentEditable, tagName } = event.target as HTMLElement;

  return isContentEditable || tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA';
}

export const AiResultOpenContext = createContextId<Signal<boolean>>('aiResultOpen');

export const DocSearch = component$((props: DocSearchProps) => {
  useStyles$(styles);
  const aiResultOpen = useSignal(false);

  useContextProvider(AiResultOpenContext, aiResultOpen);

  const state = useStore<DocSearchState>({
    isOpen: false,
    initialQuery: '',
    query: '',
    collections: [],
    context: {
      searchSuggestions: [],
    },
    activeItemId: null,
    status: 'idle',
    snippetLength: 10,
  });

  const searchButtonRef = useSignal<Element>();

  return (
    <div
      class={{ docsearch: true, 'ai-result-open': aiResultOpen.value }}
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

        if (searchButtonRef && searchButtonRef.value === document.activeElement) {
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
          aiResultOpen={aiResultOpen.value}
          indexName={props.indexName}
          apiKey={props.apiKey}
          appId={props.appId}
          state={state}
        />
      )}
    </div>
  );
});
