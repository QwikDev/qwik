/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { assertDefined, newError } from '../assert/index.js';
import { assertInstanceOf, assertString } from '../assert/index.js';
import { AsyncProvider, InjectionContext } from '../injection/types.js';

/**
 * Inject result of url expression evaluation.
 *
 * Qoot supports URLs to embed search parameters such as: `./somePath?key1=value1`
 * as defined in the URL standard. While injecting values as string is useful,
 * it is often more useful to treat the value as an expression and evaluate it.
 *
 * Example: Retrieving value of input
 * ```
 * <input on:keyup="./MyComponent_input_okKeyup?userInput=.target.value">
 * ```
 * In the above example the URL can't contain the value of the input. But instead
 * the URL contains where the value can be read from. `.target.value` is input value
 * when evaluated from `event` as `event.target.value`.
 *
 * file: `MyComponent_input.onKeyup.ts`
 * ```
 * export default inject(
 *   null,
 *   provideQrlExp<string>('userInput'),
 *   function (userInput: string) {
 *     // userInput contains `input.value`.
 *   }
 * );
 * ```
 *
 * The handler above is not interested where the `userInput` comes from. The author of the
 * template is in control where the handler should be located and than how to read the `value`
 * from the input.
 *
 * @param parameterName Which parameter name should be read from the `url.searchParams.get(parameterName)`
 */
export function provideQrlExp<T>(parameterName: string): AsyncProvider<T> {
  return function qrlExpProvider(this: InjectionContext): any {
    qDev && assertInstanceOf(this.url, URL);
    const url = this.url!;
    const value = url.searchParams.get(parameterName)!;
    qDev && assertString(value);

    switch (value.charAt(0)) {
      case '.':
        let obj: any = this.event;
        qDev && assertDefined(obj);
        const parts = value.substr(1).split('.');
        while (parts.length && obj) {
          obj = obj[parts.shift()!];
        }
        return obj;
      default:
        throw newError(`Unrecognized expression format '${value}'.`);
    }
  };
}
