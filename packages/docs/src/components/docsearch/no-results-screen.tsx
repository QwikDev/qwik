import { component$, useContext } from '@builder.io/qwik';
import { SearchContext } from './context';
import type { DocSearchState } from './doc-search';
import { NoResultsIcon } from './icons/NoResultsIcon';

export type NoResultsScreenTranslations = Partial<{
  noResultsText: string;
  suggestedQueryText: string;
  reportMissingResultsText: string;
  reportMissingResultsLinkText: string;
}>;

type NoResultsScreenProps = {
  translations?: NoResultsScreenTranslations;
  state: DocSearchState;
};

export const NoResultsScreen = component$((props: NoResultsScreenProps) => {
  const { noResultsText = 'No results for', suggestedQueryText = 'Try searching for' } =
    props.translations ?? {};
  const searchSuggestions: string[] | undefined = props.state.context.searchSuggestions as string[];
  const context: any = useContext(SearchContext);

  return (
    <div class="DocSearch-NoResults">
      <div class="DocSearch-Screen-Icon">
        <NoResultsIcon />
      </div>
      <p class="DocSearch-Title">
        {noResultsText} "<strong>{props.state.query}</strong>"
      </p>

      {searchSuggestions && searchSuggestions.length > 0 && (
        <div class="DocSearch-NoResults-Prefill-List">
          <p class="DocSearch-Help">{suggestedQueryText}:</p>
          <ul>
            {searchSuggestions.slice(0, 3).reduce<any[]>(
              (acc, search) => [
                ...acc,
                <li key={search}>
                  <button
                    class="DocSearch-Prefill"
                    key={search}
                    type="button"
                    onClick$={() => {
                      context.onInput?.({
                        target: {
                          value: search.toLowerCase() + ' ',
                        },
                      });
                    }}
                  >
                    {search}
                  </button>
                </li>,
              ],
              []
            )}
          </ul>
        </div>
      )}
    </div>
  );
});
