/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { InjectionContext, QRL } from '../qoot.js';
import { createGlobal, getBaseUri } from './node_utils.js';

/**
 * Creates a simple DOM structure for testing components.
 *
 * By default `ComponentFixture` creates:
 *
 * ```
 * <host ::="./component_fixture.noop">
 *   <child></child>
 * </host>
 * ```
 *
 * It also sets up `injectionContext` which points to `child`.
 *
 */
export class ComponentFixture {
  global: { document: Document };
  document: Document;
  host: HTMLElement;
  child: HTMLElement;
  injectionContext: InjectionContext;

  constructor() {
    const thisFileBaseURI = getBaseUri().replace(/\/[^\/]*$/, ''); // Chop of filename
    this.global = createGlobal(getBaseUri(null, /\/testing\/component_fixture\./));
    this.document = this.global.document;
    this.host = this.document.createElement('host');
    this.child = this.document.createElement('child');
    this.injectionContext = { element: this.child };
    this.host.setAttribute('::', String(QRL`${thisFileBaseURI}/component_fixture.noop`));
    this.host.appendChild(this.child);
  }
}

/**
 * Noop rendering used by `ComponentFixture`.
 */
export const noop = function () {};
