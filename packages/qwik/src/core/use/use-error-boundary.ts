import { qrl } from '../qrl/qrl';
import { ErrorBoundaryStore, ERROR_CONTEXT } from '../render/error-handling';
import { useContextProvider } from './use-context';
import { useOn } from './use-on';
import { useStore } from './use-store.public';

/**
 * @alpha
 */
export const useErrorBoundary = (): Readonly<ErrorBoundaryStore> => {
  const store: ErrorBoundaryStore = useStore({
    error: undefined,
  });
  useOn('error-boundary', qrl('/runtime', 'error', [store]));
  useContextProvider(ERROR_CONTEXT, store);

  return store;
};
