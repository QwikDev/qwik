import { qObject } from '../object/q-object';

/**
 * @public
 */
export function useStore<STATE extends {}>(initialState: STATE): STATE {
  return qObject(initialState);
}
