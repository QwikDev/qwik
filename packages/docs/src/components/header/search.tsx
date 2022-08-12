import { component$, useClientEffect$ } from '@builder.io/qwik';

export const Search = component$(() => {
  // const head  = useDocumentHead()
  const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
  useClientEffect$(() => {
    // FIXME: seems not work
    // head.links.push({
    //   rel: 'preconnect',
    //   href: `https://${appId.toLowerCase()}-dsn.algolia.net`,
    //   crossorigin: 'true'
    // })
    // head.links.push({
    //   rel: 'stylesheet',
    //   href: 'https://cdn.jsdelivr.net/npm/@docsearch/css@3',
    // })

    // @ts-ignore
    window.docsearch({
      container: '#docsearch',
      appId,
      indexName: 'docsearch-legacy',
      apiKey: import.meta.env.VITE_ALGOLIA_SEARCH_KEY,
      transformItems(items: any[]) {
        return items.map((item) => ({
          ...item,
          // TODO: remove this after migrate to algolia crawler
          url: item.url?.replace('http://host.docker.internal:3000', window.origin),
        }));
      },
    });
  });

  return <div id="docsearch"></div>;
});
