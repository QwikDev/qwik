export type PagefindSubResult = {
  title?: string | null;
  url: string;
  excerpt?: string | null;
};

export type PagefindSearchData = {
  url: string;
  excerpt?: string | null;
  meta?: {
    title?: string | null;
  };
  sub_results?: PagefindSubResult[];
};

export type PagefindSearchResult = {
  data: () => Promise<PagefindSearchData>;
};

export type PagefindSearchResponse = {
  results: PagefindSearchResult[];
};

export type PagefindModuleNamespace = {
  options: (options: { bundlePath?: string; excerptLength?: number }) => Promise<void>;
  init: () => Promise<void>;
  debouncedSearch: (
    term: string,
    options?: unknown,
    debounceTimeoutMs?: number
  ) => Promise<PagefindSearchResponse | null>;
};

export type SearchGroupTitle = 'Docs' | 'API';

export type SearchResultItem = {
  title: string;
  subtitle: string;
  href: string;
  excerpt: string;
  group: SearchGroupTitle;
};

export type SearchResultGroup = {
  title: SearchGroupTitle;
  items: SearchResultItem[];
};

const API_PREFIX = '/api';

const collapseWhitespace = (value?: string | null): string => {
  return (value ?? '').replace(/\s+/g, ' ').trim();
};

const normalizeQuery = (value: string): string => {
  return collapseWhitespace(value).toLocaleLowerCase();
};

const titleFromPath = (href: string): string => {
  const normalizedHref = normalizeSearchHref(href);
  const withoutHash = normalizedHref.split('#')[0] ?? normalizedHref;
  const segments = withoutHash.split('/').filter(Boolean);
  const lastSegment = segments.at(-1) ?? 'Result';
  return decodeURIComponent(lastSegment).replace(/[-_]+/g, ' ');
};

const normalizeTitle = (title: string): string => {
  return title
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
};

export const normalizeSearchHref = (href: string): string => {
  const url = new URL(href, 'https://qwik.dev');
  const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '') || '/';
  return `${pathname}${url.hash}`;
};

export const isApiSearchHref = (href: string): boolean => {
  const normalizedHref = normalizeSearchHref(href);
  return normalizedHref === API_PREFIX || normalizedHref.startsWith(`${API_PREFIX}/`);
};

const pickBestResult = (item: PagefindSearchData): PagefindSubResult | PagefindSearchData => {
  return (
    item.sub_results?.find(
      (subResult) => Boolean(subResult.url) && Boolean(subResult.title || subResult.excerpt)
    ) ?? item
  );
};

export const normalizePagefindResults = (items: PagefindSearchData[]): SearchResultItem[] => {
  return items.map((item) => {
    const bestResult = pickBestResult(item);
    const href = normalizeSearchHref(bestResult.url);
    const rawTitle = collapseWhitespace(
      ('title' in bestResult ? bestResult.title : undefined) ?? item.meta?.title
    );

    return {
      title: rawTitle ? rawTitle : normalizeTitle(titleFromPath(href)),
      subtitle: href,
      href,
      excerpt: collapseWhitespace(bestResult.excerpt ?? item.excerpt),
      group: isApiSearchHref(href) ? 'API' : 'Docs',
    };
  });
};

const rankGroupItems = (items: SearchResultItem[], query: string): SearchResultItem[] => {
  const normalizedQuery = normalizeQuery(query);

  if (!normalizedQuery) {
    return items;
  }

  const getPriority = (item: SearchResultItem): number => {
    const normalizedTitle = normalizeQuery(item.title);

    if (normalizedTitle === normalizedQuery) {
      return 0;
    }

    if (normalizedTitle.startsWith(normalizedQuery)) {
      return 1;
    }

    return 2;
  };

  return items
    .map((item, index) => ({
      item,
      index,
      priority: getPriority(item),
    }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map(({ item }) => item);
};

export const groupSearchResults = (items: SearchResultItem[], query = ''): SearchResultGroup[] => {
  const docsItems: SearchResultItem[] = [];
  const apiItems: SearchResultItem[] = [];

  for (const item of items) {
    if (item.group === 'API') {
      apiItems.push(item);
    } else {
      docsItems.push(item);
    }
  }

  const groups: SearchResultGroup[] = [];

  if (docsItems.length > 0) {
    groups.push({ title: 'Docs', items: rankGroupItems(docsItems, query) });
  }

  if (apiItems.length > 0) {
    groups.push({ title: 'API', items: rankGroupItems(apiItems, query) });
  }

  return groups;
};
