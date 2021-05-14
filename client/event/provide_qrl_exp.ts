/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { Injector, Provider } from '../injector/types.js';
import { assertDefined } from '../assert/index.js';
import { QError, qError } from '../error/error.js';
import { EventEntity } from '../event/event_entity.js';

/**
 * Inject result of url expression evaluation.
 *
 * Qoot supports URLs that embed parameters into the hash such as: `./somePath#foo?key1=value1`.
 * While injecting values as string is useful, it is often more useful to treat the value as an
 * expression and evaluate it.
 *
 * Example: Retrieving value of an input element
 *
 * ```
 * <input on:keyup="./MyComponent_input_okKeyup#?userInput=.target.value">
 * ```
 *
 * In the above example the URL can't contain the value of the input. But instead
 * the URL contains where the value can be read from. `.target.value` is input value
 * when evaluated from `event` as `event.target.value`.
 *
 * file: `MyComponent_input.onKeyup.ts`
 *
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
 * @param parameterName - The name of the parameter to read (and evaluate) from the `QRL` params.
 * @public
 */
export function provideQrlExp<T>(parameterName: string): Provider<T> {
  return async function qrlExpProvider(injector: Injector): Promise<any> {
    const eventEntity = await injector.getEntity(EventEntity.KEY);
    const value = eventEntity.props[parameterName]!;
    if (value == null) {
      throw qError(QError.Core_missingProperty_name_props, parameterName, eventEntity.props);
    }

    switch (value.charAt(0)) {
      case '.':
        let obj: any = eventEntity.event;
        qDev && assertDefined(obj);
        const parts = value.substr(1).split('.');
        while (parts.length && obj) {
          obj = obj[parts.shift()!];
        }
        return obj;
      default:
        throw qError(QError.Provider_unrecognizedFormat_value, value);
    }
  };
}
