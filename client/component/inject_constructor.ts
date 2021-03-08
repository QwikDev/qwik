/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { AsyncProvider, ConcreteType, AsyncProviders } from '../injection/types';

/**
 * Used to declare dependencies of a component.
 *
 * The method is used in conjunction with `Component.$inject` to declare
 * dependencies of a component. The function is typed such that it verifies
 * that the types of the providers match that of the constructor, raising a
 * type error if they do not.
 *
 * NOTE: Because of the way TS works having more providers than arguments in constructor
 * is not considered an error, because in JS extra arguments are just ignored.
 * The consequence of this is that no error is raised, but at runtime the
 * providers are still created.
 *
 * See: `Component.$inject`
 *
 * Example:
 * ```
 * class Greeter extends Component<any, any> {
 *   static $inject = injectConstructor(
 *     provideSalutation(),
 *     Greeter
 *   );
 *   constructor(salutation: string) {}
 * }
 * ```
 */

export function injectConstructor<T, ARGS extends any[]>(
  ...args: [...ARGS, ConcreteType<T, AsyncProviders<ARGS>>]
): AsyncProvider<unknown>[] {
  args.pop(); // Ignore the last one as that is the component type.
  return args as any;
}
