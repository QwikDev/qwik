/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { EntityConstructor, QRL } from '../../../';

interface BaseProps {
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
}

interface BaseEvents {
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
}

export interface JSXBase extends BaseProps, BaseEvents {}
