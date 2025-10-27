import {
  component$,
  useSignal,
  noSerialize,
  useContextProvider,
  useTask$,
  type Signal,
} from '@qwik.dev/core';
import { MAX_QUERY_SIZE } from './constants';
import { SearchContext } from './context';
import type { DocSearchProps, DocSearchState } from './doc-search';
import { handleSearch } from './handleSearch';
import type { ScreenStateTranslations } from './screen-state';
import { ScreenState } from './screen-state';
import type { SearchBoxTranslations } from './search-box';
import { SearchBox } from './search-box';
import type { DocSearchHit } from './types';

import { identity } from './utils';
import { clearStalled, setStalled } from './utils/stalledControl';
import { AIButton } from './result';
import { isBrowser } from '@qwik.dev/core';

export type ModalTranslations = Partial<{
  searchBox: SearchBoxTranslations;
}> &
  ScreenStateTranslations;

export type DocSearchModalProps = DocSearchProps & {
  translations?: ModalTranslations;
  state: DocSearchState;
  aiResultOpen?: boolean;
  isOpen: Signal<boolean>;
};

export const DocSearchModal = component$(
  ({
    appId,
    apiKey,
    indexName,
    state,
    transformItems$ = identity,
    aiResultOpen,
    disableUserPersonalization = false,
    isOpen,
  }: DocSearchModalProps) => {
    const containerRef = useSignal<Element>();
    const modalRef = useSignal<Element>();
    const formElementRef = useSignal<Element>();
    const dropdownRef = useSignal<Element>();
    const inputRef = useSignal<Element>();

    const onSelectItem = noSerialize(({ item, event }: any) => {
      if (event) {
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
          isOpen.value = false;
        }
      }
    }) as any;

    const onInput = noSerialize((event: Event) => {
      // TODO: cancelable request
      clearStalled();
      const query = (event.target as HTMLInputElement).value.slice(0, MAX_QUERY_SIZE);
      state.query = query;
      state.activeItemId = null;
      state.status = 'loading';
      // set new stalledId
      setStalled(() => {
        state.status = 'stalled';
      });
      handleSearch(query, {
        state: state,
        appId: appId,
        apiKey: apiKey,
        indexName: indexName,
        snippetLength: 10,
        transformItems: (data: DocSearchHit[]) => {
          return transformItems$.apply(undefined, [data]);
        },
      })
        .then(({ collections }) => {
          state.status = 'idle';
          state.collections = collections.reverse().map((c) => ({
            ...c,
            source: {
              items: c.items,
              sourceId: c.sourceId,
            },
          }));
          // TODO:
          // if not opened, ensure open
          // if actived before, set active
        })
        .finally(() => {
          clearStalled();
          state.status = 'idle';
        });
    });
    useContextProvider(SearchContext, {
      onSelectItem,
      onInput,
    });

    // useTouchEvents({
    //   getEnvironmentProps,
    //   panelElement: dropdownRef.current as any,
    //   formElement: formElementRef.current as any,
    //   inputElement: inputRef.current as any,
    // });

    // TODO:
    // useTrapFocus(containerRef as any);

    useTask$(() => {
      if (isBrowser) {
        document.body.classList.add('DocSearch--active');

        return () => {
          document.body.classList.remove('DocSearch--active');
          document.body.style.overflow = '';
        };
      }
    });

    useTask$(({ track }) => {
      if (isBrowser) {
        track(() => state.query);
        if (dropdownRef.value) {
          dropdownRef.value.scrollTop = 0;
        }
      }
    });

    // We rely on a CSS property to set the modal height to the full viewport height
    // because all mobile browsers don't compute their height the same way.
    // See https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
    useTask$(() => {
      if (isBrowser) {
        const setFullViewportHeight = () => {
          if (modalRef.value) {
            const vh = window.innerHeight * 0.01;
            // @ts-ignore
            modalRef.value.style.setProperty('--docsearch-vh', `${vh}px`);
          }
        };

        setFullViewportHeight();

        window.addEventListener('resize', setFullViewportHeight);

        return () => {
          window.removeEventListener('resize', setFullViewportHeight);
        };
      }
    });

    return (
      <div
        ref={containerRef}
        aria-expanded="true"
        aria-haspopup="listbox"
        aria-owns="docsearch-list"
        aria-labelledby="docsearch-list"
        class={[
          'DocSearch',
          'DocSearch-Container',
          state.status === 'stalled' && 'DocSearch-Container--Stalled',
          state.status === 'error' && 'DocSearch-Container--Errored',
        ]}
        role="button"
        tabIndex={0}
        onMouseDown$={(event) => {
          if (event.target === containerRef.value) {
            isOpen.value = false;
          }
        }}
      >
        <div class="DocSearch-Modal" ref={modalRef}>
          <header class="DocSearch-SearchBar" ref={formElementRef}>
            <SearchBox isOpen={isOpen} state={state} autoFocus={true} inputRef={inputRef as any} />
          </header>

          <div class="DocSearch-Dropdown" ref={dropdownRef}>
            <div class="DocSearch-Dropdown-Container">
              <section class="DocSearch-Hits">
                <ul role="listbox" aria-labelledby="docsearch-label" id="docsearch-list">
                  <AIButton state={state} />
                </ul>
              </section>
            </div>
            <ScreenState
              state={state}
              disableUserPersonalization={disableUserPersonalization}
              inputRef={inputRef as any}
            />
          </div>
        </div>
      </div>
    );
  }
);
