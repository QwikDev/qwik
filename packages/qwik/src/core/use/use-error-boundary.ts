import { type ErrorBoundaryStore, ERROR_CONTEXT } from '../render/error-handling';
import { useContextProvider } from './use-context';
import { useStore } from './use-store.public';

/** @public */
export const useErrorBoundary = () => {
  const error = useStore<ErrorBoundaryStore>({ error: undefined });
  useContextProvider(ERROR_CONTEXT, error);

  return error;
};
