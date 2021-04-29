/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { QRL } from 'client/import/qrl.js';
import { ServiceConstructor } from '../../service/service.js';

/**
 * Base JSX type containing universal properties.
 *
 * @public
 */
export interface JSXBase {
  /**
   * Declare `Injector` `Service` providers.
   *
   * See: `Injector`, `Service`
   */
  'decl:services'?: ServiceConstructor<any>[];

  /**
   * Declare component template.
   */
  'decl:template'?: QRL;

  class?: string | string[] | Record<string, boolean>;

  style?: string | Record<string, string>;
}
