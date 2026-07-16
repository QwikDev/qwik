import { _getQContainerElement } from '../client/dom-container';
import { isDev } from '@qwik.dev/core/build';
import { assertDefined } from '../shared/error/assert';
import { _captures } from '../shared/qrl/qrl-class';

// <docs markdown="../readme.md#useLexicalScope">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useLexicalScope instead and run `pnpm docs.sync`)
/**
 * Used by the Qwik Optimizer to restore the lexically scoped variables.
 *
 * This method should not be present in the application source code.
 *
 * NOTE: `useLexicalScope` method can only be used in the synchronous portion of the callback
 * (before any `await` statements.)
 *
 * @deprecated Use `_captures` instead.
 * @internal
 */
// </docs>
export const useLexicalScope = <VARS extends any[]>(): VARS => {
  isDev && assertDefined(_captures, 'invoke: captures must be defined for useLexicalScope()');
  return _captures as VARS;
};
