import {
  component$,
  noSerialize,
  useComputed$,
  useSignal,
  useStyles$,
  useTask$,
  useVisibleTask$,
  type NoSerialize,
} from '@qwik.dev/core';
import { Link, useLocation } from '@qwik.dev/router';
import { lucide, modal } from '@qds.dev/ui';
import { AutocompleteInput } from '../input/autocomplete-input';
import {
  groupSearchResults,
  normalizePagefindResults,
  type PagefindModuleNamespace,
  type SearchResultGroup,
  type SearchResultItem,
} from './pagefind';
import styles from './search.css?inline';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 8;
const SEARCH_DEBOUNCE_MS = 200;
const EXCERPT_LENGTH = 12;

const importPagefind = async (): Promise<PagefindModuleNamespace> => {
  // Keep this as a runtime-only import. A direct import('/pagefind/pagefind.js')
  // gets picked up by the Qwik/Vite build and Rollup then tries to resolve it
  // as a normal source dependency, but Pagefind only exists as a generated
  // public asset after indexing.
  // eslint-disable-next-line no-new-func
  const importer = new Function('return import("/pagefind/pagefind.js")') as () => Promise<unknown>;
  return (await importer()) as PagefindModuleNamespace;
};

export const SearchModal = component$(() => {
  useStyles$(styles);

  const loc = useLocation();
  const isOpen = useSignal(false);
  const query = useSignal('');
  const pagefind = useSignal<NoSerialize<PagefindModuleNamespace>>();
  const initState = useSignal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const results = useSignal<SearchResultGroup[]>([]);
  const searchError = useSignal(false);
  const isSearching = useSignal(false);

  useTask$(({ track }) => {
    track(() => `${loc.url.pathname}${loc.url.search}${loc.url.hash}`);
    isOpen.value = false;
  });

  useVisibleTask$(async ({ track }) => {
    const open = track(isOpen);

    if (!open || pagefind.value || initState.value === 'loading') {
      return;
    }

    initState.value = 'loading';

    try {
      const loadedPagefind = await importPagefind();
      await loadedPagefind.options({
        bundlePath: '/pagefind/',
        excerptLength: EXCERPT_LENGTH,
      });
      await loadedPagefind.init();
      pagefind.value = noSerialize(loadedPagefind);
      initState.value = 'ready';
    } catch (_error) {
      initState.value = 'error';
    }
  });

  useTask$(async ({ track, cleanup }) => {
    const open = track(isOpen);
    const trimmedQuery = track(() => query.value.trim());
    const currentInitState = track(initState);
    const loadedPagefind = track(() => pagefind.value);

    if (
      !open ||
      currentInitState !== 'ready' ||
      trimmedQuery.length < MIN_QUERY_LENGTH ||
      !loadedPagefind
    ) {
      isSearching.value = false;
      searchError.value = false;

      if (trimmedQuery.length < MIN_QUERY_LENGTH) {
        results.value = [];
      }

      return;
    }

    let cancelled = false;
    cleanup(() => {
      cancelled = true;
    });

    // Preserve the previous results until the next search settles.
    isSearching.value = true;
    searchError.value = false;

    try {
      const search = await loadedPagefind.debouncedSearch(
        trimmedQuery,
        undefined,
        SEARCH_DEBOUNCE_MS
      );

      if (cancelled) {
        return;
      }

      if (!search || search.results.length === 0) {
        results.value = [];
        return;
      }

      const loadedResults = await Promise.all(
        search.results.slice(0, MAX_RESULTS).map((result) => result.data())
      );

      if (cancelled) {
        return;
      }

      results.value = groupSearchResults(normalizePagefindResults(loadedResults), trimmedQuery);
    } catch (_error) {
      if (!cancelled) {
        searchError.value = true;
      }
    } finally {
      if (!cancelled) {
        isSearching.value = false;
      }
    }
  });

  const trimmedQuery = useComputed$(() => query.value.trim());
  const queryReady = useComputed$(() => trimmedQuery.value.length >= MIN_QUERY_LENGTH);
  const isUnavailable = useComputed$(() => initState.value === 'error' || searchError.value);
  const isLoading = useComputed$(() => {
    return queryReady.value && (initState.value === 'loading' || isSearching.value);
  });
  const hasResults = useComputed$(() => results.value.length > 0);
  const showEmpty = useComputed$(() => {
    return queryReady.value && !isLoading.value && !isUnavailable.value && !hasResults.value;
  });
  const shouldScrollResults = useComputed$(() => hasResults.value);

  return (
    <modal.root bind:open={isOpen}>
      <modal.trigger class="w-fit flex items-center gap-2 group ui-open:text-standalone-accent transition-colors duration-200 2xl:h-[76px] 2xl:px-5 cursor-pointer">
        <lucide.search class="size-6 text-foreground-base" />
      </modal.trigger>

      <modal.content
        class={{
          'search-modal': true,
          'search-modal-scrollable': shouldScrollResults.value,
        }}
      >
        <div
          class={{
            'flex flex-col': true,
            'search-modal-body-scrollable': shouldScrollResults.value,
          }}
        >
          <AutocompleteInput
            icon="search"
            type="search"
            value={query.value}
            autoFocus
            autocomplete="off"
            placeholder="Search docs"
            onInput$={(_, target) => {
              query.value = target.value;
            }}
          />

          <div
            class={{
              'search-results mt-10 pr-2 w-full': true,
              'search-results-scrollable': shouldScrollResults.value,
            }}
          >
            {!queryReady.value ? (
              <SearchIdle />
            ) : isUnavailable.value ? (
              <SearchUnavailable />
            ) : showEmpty.value ? (
              <SearchNoResults />
            ) : (
              results.value.map((group) => <SearchResults key={group.title} group={group} />)
            )}
          </div>
        </div>
      </modal.content>
    </modal.root>
  );
});

const SearchIdle = component$(() => {
  const group: SearchResultGroup = {
    title: 'Docs',
    items: [
      {
        title: 'Getting Started',
        subtitle: 'Learn how to get started with Qwik',
        href: '/docs/getting-started/overview',
        excerpt: 'This section provides an overview of getting started with Qwik.',
        group: 'Docs',
      },
      {
        title: 'State',
        subtitle: 'Manage state in Qwik',
        href: '/docs/core/state',
        excerpt: 'Learn how to manage state in Qwik applications.',
        group: 'Docs',
      },
      {
        title: 'Events',
        subtitle: 'Handle events in Qwik',
        href: '/docs/core/events',
        excerpt: 'Discover how to handle events in Qwik applications.',
        group: 'Docs',
      },
      {
        title: 'Routing',
        subtitle: 'Navigate between pages in Qwik',
        href: '/docs/routing',
        excerpt: 'Understand how to implement routing in Qwik applications.',
        group: 'Docs',
      },
      {
        title: 'Deployment',
        subtitle: 'Deploy your Qwik app',
        href: '/docs/deployments',
        excerpt: 'Find out how to deploy your Qwik application to production.',
        group: 'Docs',
      },
    ],
  };
  return <SearchResults group={group} />;
});

const SearchUnavailable = component$(() => {
  return (
    <p class="w-full text-center text-foreground-muted text-body-xs">
      Search index unavailable. Run the Pagefind build command and try again.
    </p>
  );
});

const SearchNoResults = component$(() => {
  return <p class="w-full text-center text-foreground-muted text-body-xs">No search results.</p>;
});

type SearchResultsProps = {
  group: SearchResultGroup;
};

const SearchResults = component$<SearchResultsProps>(({ group }) => {
  return (
    <section class="block mt-6 w-full first:mt-0">
      <span class="text-base text-foreground-muted">{group.title}</span>
      <ul class="mt-2 flex flex-col gap-2">
        {group.items.map((item) => (
          <SearchResultLink key={item.href} item={item} />
        ))}
      </ul>
    </section>
  );
});

type SearchResultLinkProps = {
  item: SearchResultItem;
};

const SearchResultLink = component$<SearchResultLinkProps>(({ item }) => {
  return (
    <li>
      <Link
        href={item.href}
        class="flex gap-3 items-center px-4 pt-4 pb-3 relative rounded-[4px] bg-secondary-background-base hover:bg-secondary-background-accent transition-colors shadow-secondary-border-inset"
      >
        <lucide.file class="size-6 shrink-0 text-primary-standalone-base" />
        <div class="flex flex-col items-end w-full">
          <span class="text-foreground-base text-label-base">{item.title}</span>
          {item.excerpt && (
            <span
              class="search-result-excerpt text-foreground-base text-body-xs"
              dangerouslySetInnerHTML={item.excerpt}
            />
          )}
        </div>
      </Link>
    </li>
  );
});
