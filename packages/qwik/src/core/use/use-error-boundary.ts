import { ERROR_CONTEXT, type ErrorBoundaryStore } from '../shared/error/error-handling';
import { useContextProvider } from './use-context';
import { useStore } from './use-store.public';

/** @public */
export const useErrorBoundary = () => {
  const error = useStore<ErrorBoundaryStore>({ error: undefined });
  useContextProvider(ERROR_CONTEXT, error);

  return error;
};
