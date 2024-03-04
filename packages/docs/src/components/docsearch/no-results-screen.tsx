import { component$ } from '@builder.io/qwik';
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
  return (
    <div class="DocSearch-NoResults">
      <div class="DocSearch-Screen-Icon">
        <NoResultsIcon />
      </div>
      <p class="DocSearch-Title">
        No results for "<strong>{props.state.query}</strong>"
      </p>
    </div>
  );
});
