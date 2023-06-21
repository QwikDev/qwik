// @ts-ignore
import algoliasearch from 'algoliasearch/dist/algoliasearch-lite.esm.browser';
import type { SearchClient } from 'algoliasearch/lite';
import { preResolve, postResolve, resolve } from '@algolia/autocomplete-core/dist/esm/resolve';
import { reshape } from '@algolia/autocomplete-core/dist/esm/reshape';
import type { DocSearchHit } from './types';
import { groupBy, removeHighlightTags } from './utils';

import { version } from './version';

let client: SearchClient;

export function handleSearch(
  query: string,
  { state, appId, apiKey, indexName, snippetLength, transformItems }: any
) {
  if (!client) {
    client = algoliasearch(appId, apiKey);
    client.addAlgoliaAgent('docsearch', version);
  }

  let q = Promise.resolve([] as any[]);
  if (query) {
    q = client
      .search<DocSearchHit>([
        {
          query,
          indexName,
          params: {
            attributesToRetrieve: [
              'hierarchy.lvl0',
              'hierarchy.lvl1',
              'hierarchy.lvl2',
              'hierarchy.lvl3',
              'hierarchy.lvl4',
              'hierarchy.lvl5',
              'hierarchy.lvl6',
              'content',
              'type',
              'url',
            ],
            attributesToSnippet: [
              `hierarchy.lvl1:${snippetLength}`,
              `hierarchy.lvl2:${snippetLength}`,
              `hierarchy.lvl3:${snippetLength}`,
              `hierarchy.lvl4:${snippetLength}`,
              `hierarchy.lvl5:${snippetLength}`,
              `hierarchy.lvl6:${snippetLength}`,
              `content:${snippetLength}`,
            ],
            snippetEllipsisText: '…',
            highlightPreTag: '<mark>',
            highlightPostTag: '</mark>',
            hitsPerPage: 20,
          },
        },
      ])
      .then(({ results }) => {
        const { hits, nbHits } = results[0];
        const rawSources = groupBy(hits, (hit) => removeHighlightTags(hit));

        // We store the `lvl0`s to display them as search suggestions
        // in the "no results" screen.
        if ((state.context.searchSuggestions as any[]).length < Object.keys(rawSources).length) {
          state.context.searchSuggestions = Object.keys(rawSources);
        }
        state.context.nbHits = nbHits;

        return Object.values<DocSearchHit[]>(rawSources).map((items, index) => {
          return {
            sourceId: `hits${index}`,
            items,
            getItemUrl: ({ item }: any) => item.url,
            getItemInputValue: () => {},
            onSelect: () => {},
            getItems() {
              return Promise.all(
                Object.values(groupBy(items, (item) => item.hierarchy.lvl1)).map((x) => {
                  if (transformItems) {
                    return transformItems(x);
                  }
                  return x;
                })
              ).then((resp) => {
                return resp
                  .map((groupedHits) =>
                    groupedHits.map((item: any) => {
                      return {
                        ...item,
                        __docsearch_parent:
                          item.type !== 'lvl1' &&
                          groupedHits.find(
                            (siblingItem: any) =>
                              siblingItem.type === 'lvl1' &&
                              siblingItem.hierarchy.lvl1 === item.hierarchy.lvl1
                          ),
                      };
                    })
                  )
                  .flat();
              });
            },
          };
        });
      });
  }
  return q
    .then((sources) => {
      return Promise.all(
        sources.map((source) => {
          return Promise.resolve(source.getItems()).then((itemsOrDescription) =>
            preResolve<any>(itemsOrDescription, source.sourceId)
          );
        })
      )
        .then(resolve)
        .then((responses) => postResolve(responses, sources as any))
        .then((collections) => {
          return reshape({
            collections,
            props: {
              reshape: ({ sources }: any) => sources,
            } as any,
            state: {} as any,
          });
        });
    })
    .then((collections) => {
      let baseItemId = 0;
      const value = collections.map<any>((collection) => ({
        ...collection,
        // We flatten the stored items to support calling `getAlgoliaResults`
        // from the source itself.
        items: (collection.items as any[]).flat(Infinity).map((item: any) => ({
          ...item,
          __autocomplete_id: baseItemId++,
        })),
      }));

      return {
        collections: value,
      };
    });
}
