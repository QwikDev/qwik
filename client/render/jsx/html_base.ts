/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { QRL } from 'client/import/qrl.js';
import { EntityConstructor } from '../../entity/entity.js';

/**
 * Base JSX type containing universal properties.
 *
 * @public
 */
export interface JSXBase {
  /**
   * Declare `Injector` `Entity` providers.
   *
   * See: `Injector`, `Entity`
   */
  'decl:entity'?: EntityConstructor<any>[];

  /**
   * Declare component template.
   */
  'decl:template'?: QRL;

  /**
   * Event fired when DOM is first loaded
   */
  'on:qInit'?: QRL;

  // TODO: document
  'on:qInterval'?: QRL;

  // TODO: document
  'on:qTimeout'?: QRL;

  // TODO: document
  'on:qRender'?: QRL;

  class?: string | string[] | Record<string, boolean>;

  style?: string | Record<string, string>;

  // TODO: document
  // TODO: investigate why this is needed
  children?: any;
}
