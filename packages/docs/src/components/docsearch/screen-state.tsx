import { component$, type Signal } from '@builder.io/qwik';
import type { DocSearchState } from './doc-search';
import type { ErrorScreenTranslations } from './error-screen';
import { ErrorScreen } from './error-screen';
import type { NoResultsScreenTranslations } from './no-results-screen';
import { NoResultsScreen } from './no-results-screen';
import { ResultsScreen } from './results-screen';
import { StartScreen } from './start-screen';

export type ScreenStateTranslations = Partial<{
  errorScreen: ErrorScreenTranslations;
  noResultsScreen: NoResultsScreenTranslations;
}>;

export interface ScreenStateProps {
  state: DocSearchState;
  inputRef: Signal<HTMLInputElement | undefined>;
  disableUserPersonalization: boolean;
}

export const ScreenState = component$((props: ScreenStateProps) => {
  if (props.state.status === 'error') {
    return <ErrorScreen />;
  }

  const hasCollections = props.state.collections.some((collection) => collection.items.length > 0);

  if (!props.state.query) {
    return <StartScreen />;
  }

  if (hasCollections === false) {
    return <NoResultsScreen state={props.state} />;
  }

  return <ResultsScreen state={props.state} />;
});

// TODO: prevent UI flickering
// function areEqual(_prevProps, nextProps) {
//   // We don't update the screen when Autocomplete is loading or stalled to
//   // avoid UI flashes:
//   //  - Empty screen → Results screen
//   //  - NoResults screen → NoResults screen with another query
//   return nextProps.state.status === 'loading' || nextProps.state.status === 'stalled';
// }
