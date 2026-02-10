import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { useResourceQrl } from './use-resource';

// <docs markdown="../readme.md#useResource">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useResource instead and run `pnpm docs.sync`)
/**
 * This method works like an async memoized function that runs whenever some tracked value changes
 * and returns some data.
 *
 * `useResource` however returns immediate a `ResourceReturn` object that contains the data and a
 * state that indicates if the data is available or not.
 *
 * The status can be one of the following:
 *
 * - `pending` - the data is not yet available.
 * - `resolved` - the data is available.
 * - `rejected` - the data is not available due to an error or timeout.
 *
 * Be careful when using a `try/catch` statement in `useResource$`. If you catch the error and don't
 * re-throw it (or a new Error), the resource status will never be `rejected`.
 *
 * @deprecated Use `useAsync$` instead, which is more powerful and flexible. `useResource$` is still
 *   available for backward compatibility but it is recommended to migrate to `useAsync$` for new
 *   code and when updating existing code.
 * @public
 * @see useAsync$
 * @see Resource
 * @see ResourceReturn
 */
// </docs>
export const useResource$ = implicit$FirstArg(useResourceQrl);
