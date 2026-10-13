import { ERROR_CONTEXT, type CatchStore } from '../shared/error/error-handling';
import { useContextProvider } from './use-context';
import { useStore } from './use-store.public';

const createCatchStore = (): CatchStore =>
  Object.defineProperty({ error: undefined }, 'error', { enumerable: false });

/** @internal */
export const useCatchStore = () => {
  const error = useStore(createCatchStore);
  useContextProvider(ERROR_CONTEXT, error);

  return error;
};
