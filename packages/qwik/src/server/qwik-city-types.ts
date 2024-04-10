/* eslint-disable @typescript-eslint/no-restricted-imports */
/**
 * @file
 *
 *   Importing directly from `qwik` is not allowed because the SSR package would end up with two
 *   copies of the code. Instead, the SSR package should import from `@builder.io/qwik-city`.
 *
 *   The exception to this rule is importing types, because those get elided by TypeScript. To make
 *   ensuring that this rule is followed, this file is the only place where relative `../` imports
 *   of types only are allowed.
 *
 *   (Then it is easy to verify that there are no imports which have `../` in their path, except for
 *   this file, which is only allowed to import types)
 */

export type { QPrefetchData } from '../../../qwik-city/runtime/src/service-worker/types';
