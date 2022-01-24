import { qObject } from '../object/q-object';

/**
 * @public
 */
export function useState<STATE extends {}>(initialState: STATE): STATE {
  return qObject(initialState);
}
