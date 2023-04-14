import {
  component$,
  useSignal,
  noSerialize,
  useContextProvider,
  useVisibleTask$,
} from '@builder.io/qwik';
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

export type ModalTranslations = Partial<{
  searchBox: SearchBoxTranslations;
}> &
  ScreenStateTranslations;

export type DocSearchModalProps = DocSearchProps & {
  translations?: ModalTranslations;
  state: DocSearchState;
};

export const DocSearchModal = component$(
  ({
    appId,
    apiKey,
    indexName,
    state,
    transformItems$ = identity,
    disableUserPersonalization = false,
  }: DocSearchModalProps) => {
    const containerRef = useSignal<Element>();
    const modalRef = useSignal<Element>();
    const formElementRef = useSignal<Element>();
    const dropdownRef = useSignal<Element>();
    const inputRef = useSignal<Element>();

    const onSelectItem = noSerialize(({ item, event }: any) => {
      if (event) {
        if (!event.shiftKey && !event.ctrlKey && !event.metaKey) {
          state.isOpen = false;
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
          state.collections = collections.map((c) => ({
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

    useVisibleTask$(() => {
      document.body.classList.add('DocSearch--active');
      const isMobileMediaQuery = window.matchMedia('(max-width: 768px)');

      if (isMobileMediaQuery.matches) {
        state.snippetLength = 5;
      }

      return () => {
        document.body.classList.remove('DocSearch--active');
      };
    });

    useVisibleTask$(({ track }) => {
      track(() => state.query);
      if (dropdownRef.value) {
        dropdownRef.value.scrollTop = 0;
      }
    });

    // We rely on a CSS property to set the modal height to the full viewport height
    // because all mobile browsers don't compute their height the same way.
    // See https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
    useVisibleTask$(() => {
      function setFullViewportHeight() {
        if (modalRef.value) {
          const vh = window.innerHeight * 0.01;
          // @ts-ignore
          modalRef.value.style.setProperty('--docsearch-vh', `${vh}px`);
        }
      }

      setFullViewportHeight();

      window.addEventListener('resize', setFullViewportHeight);

      return () => {
        window.removeEventListener('resize', setFullViewportHeight);
      };
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
        ]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={0}
        onMouseDown$={(event) => {
          if (event.target === containerRef.value) {
            state.isOpen = false;
          }
        }}
      >
        <div class="DocSearch-Modal" ref={modalRef}>
          <header class="DocSearch-SearchBar" ref={formElementRef}>
            <SearchBox
              state={state}
              autoFocus={true}
              inputRef={inputRef as any}
              onClose$={() => {
                state.isOpen = false;
              }}
            />
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
