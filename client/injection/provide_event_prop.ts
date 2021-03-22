/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ensureEventInjector } from './event_injector.js';
import { AsyncProvider, Injector } from './types.js';

export function provideEventProp(parameterName: string): AsyncProvider<string> | null {
  return function eventPropProvider(injector: Injector): any {
    // TODO: Could we pass in EventInjector instead of Injector?
    const eventInjector = ensureEventInjector(injector);
    return eventInjector.props[parameterName] || null;
  };
}
