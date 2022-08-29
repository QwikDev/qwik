import { component$, Ref } from '@builder.io/qwik';

import type { DocSearchState } from './doc-search';
import type { ErrorScreenTranslations } from './error-screen';
import { ErrorScreen } from './error-screen';
import type { NoResultsScreenTranslations } from './no-results-screen';
import { NoResultsScreen } from './no-results-screen';
import { ResultsScreen } from './results-screen';
import type { StartScreenTranslations } from './start-screen';
import { StartScreen } from './start-screen';

export type ScreenStateTranslations = Partial<{
  errorScreen: ErrorScreenTranslations;
  startScreen: StartScreenTranslations;
  noResultsScreen: NoResultsScreenTranslations;
}>;

export interface ScreenStateProps {
  state: DocSearchState;
  inputRef: Ref<HTMLInputElement | null>;
  disableUserPersonalization: boolean;
  translations: ScreenStateTranslations;
}

export const ScreenState = component$(
  ({ translations = {}, state, disableUserPersonalization }: ScreenStateProps) => {
    if (state.status === 'error') {
      return <ErrorScreen translations={translations?.errorScreen} />;
    }

    const hasCollections = state.collections.some((collection) => collection.items.length > 0);

    if (!state.query) {
      return (
        <StartScreen
          disableUserPersonalization={disableUserPersonalization}
          state={state}
          translations={translations?.startScreen}
        />
      );
    }

    if (hasCollections === false) {
      return <NoResultsScreen state={state} translations={translations?.noResultsScreen} />;
    }

    return <ResultsScreen state={state} />;
  }
);

// TODO: prevent UI flickering
// function areEqual(_prevProps, nextProps) {
//   // We don't update the screen when Autocomplete is loading or stalled to
//   // avoid UI flashes:
//   //  - Empty screen → Results screen
//   //  - NoResults screen → NoResults screen with another query
//   return nextProps.state.status === 'loading' || nextProps.state.status === 'stalled';
// }
