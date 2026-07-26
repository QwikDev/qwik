import { ERROR_CONTEXT, type ErrorBoundaryStore } from '../shared/error/error-handling';
import { useContextProvider } from './use-context';
import { useStore } from './use-store.public';

/** @internal */
export const useErrorBoundaryStore = () => {
  // Serializer walks enumerable keys, so a non-enumerable `error` never crosses the wire.
  const target = Object.defineProperty({} as ErrorBoundaryStore, 'error', {
    value: undefined,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  const error = useStore<ErrorBoundaryStore>(target);
  useContextProvider(ERROR_CONTEXT, error);

  return error;
};
