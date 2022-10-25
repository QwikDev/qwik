import { RecentIcon } from './icons/RecentIcon';
import { ResetIcon } from './icons/ResetIcon';
import { StarIcon } from './icons/StarIcon';
import { Result } from './result';
import type { ScreenStateProps } from './screen-state';
import { component$, useContext } from '@builder.io/qwik';
import { SearchContext } from './context';

export type StartScreenTranslations = Partial<{
  recentSearchesTitle: string;
  noRecentSearchesText: string;
  saveRecentSearchButtonTitle: string;
  removeRecentSearchButtonTitle: string;
  favoriteSearchesTitle: string;
  removeFavoriteSearchButtonTitle: string;
}>;

type StartScreenProps = Pick<ScreenStateProps, 'state' | 'disableUserPersonalization'> & {
  translations?: StartScreenTranslations;
};

export const StartScreen = component$((props: StartScreenProps) => {
  const {
    recentSearchesTitle = 'Recent',
    noRecentSearchesText = 'No recent searches',
    saveRecentSearchButtonTitle = 'Save this search',
    removeRecentSearchButtonTitle = 'Remove this search from history',
    favoriteSearchesTitle = 'Favorite',
    removeFavoriteSearchButtonTitle = 'Remove this search from favorites',
  } = props.translations ?? {};
  const context: any = useContext(SearchContext);
  const hasCollections = props.state.collections.some((collection) => collection.items.length > 0);
  if (props.state.status === 'idle' && hasCollections === false) {
    if (props.disableUserPersonalization) {
      return null;
    }

    return (
      <div className="DocSearch-StartScreen">
        <p className="DocSearch-Help">{noRecentSearchesText}</p>
      </div>
    );
  }

  if (hasCollections === false) {
    return null;
  }
  const recentCollection = props.state.collections[0];
  const favCollection = props.state.collections[1];
  return (
    <div className="DocSearch-Dropdown-Container">
      <section class="DocSearch-Hits">
        <div class="DocSearch-Hit-source">{recentSearchesTitle}</div>

        <ul role="listbox" aria-labelledby="docsearch-label" id="docsearch-list">
          {recentCollection &&
            recentCollection.items.map((item, index) => {
              return (
                <Result state={props.state} item={item} key={item.objectID}>
                  <div q:slot="start-action" className="DocSearch-Hit-icon">
                    <RecentIcon />
                  </div>
                  <div q:slot="end-action" class="DocSearch-Hit-action">
                    <button
                      className="DocSearch-Hit-action-button"
                      title={saveRecentSearchButtonTitle}
                      type="button"
                      preventdefault:click
                      onClick$={(event) => {
                        // @ts-ignore
                        props.state.favoriteSearches?.add(item);
                        // @ts-ignore
                        props.state.recentSearches?.remove(item);
                        // @ts-ignore
                        context.onInput({ target: { value: '' } });
                      }}
                    >
                      <StarIcon />
                    </button>
                  </div>
                  <div className="DocSearch-Hit-action">
                    <button
                      className="DocSearch-Hit-action-button"
                      title={removeRecentSearchButtonTitle}
                      type="submit"
                      preventdefault:click
                      onClick$={(event) => {
                        // @ts-ignore
                        props.state.recentSearches?.remove(item);
                        // @ts-ignore
                        context.onInput({ target: { value: '' } });
                      }}
                    >
                      <ResetIcon />
                    </button>
                  </div>
                </Result>
              );
            })}
        </ul>
      </section>
      <section class="DocSearch-Hits">
        <div class="DocSearch-Hit-source">{favoriteSearchesTitle}</div>

        <ul role="listbox" aria-labelledby="docsearch-label" id="docsearch-list">
          {favCollection &&
            favCollection.items.map((item, index) => {
              return (
                <Result state={props.state} item={item}>
                  <div q:slot="start-action" className="DocSearch-Hit-icon">
                    <StarIcon />
                  </div>
                  <div q:slot="end-action" class="DocSearch-Hit-action">
                    <button
                      className="DocSearch-Hit-action-button"
                      title={removeFavoriteSearchButtonTitle}
                      type="submit"
                      preventdefault:click
                      onClick$={(event) => {
                        // @ts-ignore
                        props.state.favoriteSearches?.remove(item);
                        // @ts-ignore
                        context.onInput({ target: { value: '' } });
                      }}
                    >
                      <ResetIcon />
                    </button>
                  </div>
                </Result>
              );
            })}
        </ul>
      </section>
    </div>
  );
});
