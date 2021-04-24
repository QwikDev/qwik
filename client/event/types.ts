/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { InjectedFunction } from '../injector/types.js';

/**
 * @public
 */
export interface EventHandler<SELF, ARGS extends any[], RET> {
  (element: HTMLElement, event: Event, url: URL): Promise<RET>;
  $delegate: InjectedFunction<SELF, ARGS, [], RET>;
}
