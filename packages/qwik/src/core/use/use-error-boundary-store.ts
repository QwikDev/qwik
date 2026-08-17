import { ERROR_CONTEXT, type ErrorBoundaryStore } from '../shared/error/error-handling';
import { useContextProvider } from './use-context';
import { useStore } from './use-store.public';

const createErrorBoundaryStore = (): ErrorBoundaryStore =>
  Object.defineProperty({ error: undefined }, 'error', { enumerable: false });

/** @internal */
export const useErrorBoundaryStore = () => {
  const error = useStore(createErrorBoundaryStore);
  useContextProvider(ERROR_CONTEXT, error);

  return error;
};
