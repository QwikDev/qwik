import type { SearchClient } from 'algoliasearch/lite';
import {
  component$,
  useStore,
  useStyles$,
  useSignal,
  createContextId,
  useContextProvider,
  type Signal,
  $,
  sync$,
} from '@builder.io/qwik';
import { Modal } from '@qwik-ui/headless';
import type { DocSearchHit, InternalDocSearchHit } from './types';
import { type ButtonTranslations } from './doc-search-button';
import { DocSearchModal, type ModalTranslations } from './doc-search-modal';
import styles from './doc-search.css?inline';

export type DocSearchTranslations = Partial<{
  button: ButtonTranslations;
  modal: ModalTranslations;
}>;

export type DocSearchState = {
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
  isOpen: Signal<boolean>;
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
      window:onKeyDown$={[
        sync$((event: KeyboardEvent) => {
          if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
          }
        }),
        $((event) => {
          function open() {
            // We check that no other DocSearch modal is showing before opening
            // another one.
            if (!document.body.classList.contains('DocSearch--active')) {
              props.isOpen.value = true;
            }
          }
          if (
            (event.key === 'Escape' && props.isOpen.value) ||
            // The `Cmd+K` shortcut both opens and closes the modal.
            (event.key === 'k' && (event.metaKey || event.ctrlKey)) ||
            // The `/` shortcut opens but doesn't close the modal because it's
            // a character.
            (!isEditingContent(event) && event.key === '/' && !props.isOpen.value)
          ) {
            event.preventDefault();
            if (props.isOpen.value) {
              props.isOpen.value = false;
            } else if (!document.body.classList.contains('DocSearch--active')) {
              open();
            }
          }

          if (searchButtonRef && searchButtonRef.value === document.activeElement) {
            if (/[a-zA-Z0-9]/.test(String.fromCharCode(event.keyCode))) {
              props.isOpen.value = true;
              state.initialQuery = event.key;
            }
          }
        }),
      ]}
    >
      <Modal.Root bind:show={props.isOpen}>
        <Modal.Panel>
          {props.isOpen.value && (
            <DocSearchModal
              isOpen={props.isOpen}
              aiResultOpen={aiResultOpen.value}
              indexName={props.indexName}
              apiKey={props.apiKey}
              appId={props.appId}
              state={state}
            />
          )}
        </Modal.Panel>
      </Modal.Root>
    </div>
  );
});
