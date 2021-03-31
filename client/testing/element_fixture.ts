/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { ElementInjector } from '../injector/element_injector.js';
import { Injector } from '../index.js';
import { createGlobal } from './node_utils.js';

/**
 * Creates a simple DOM structure for testing components.
 *
 * By default `ServiceFixture` creates:
 *
 * ```
 * <host ::="./component_fixture.noop">
 *   <child></child>
 * </host>
 * ```
 *
 * It also sets up `injector` which points to `child`.
 *
 */
export class ElementFixture {
  global: { document: Document };
  document: Document;
  superParent: HTMLElement;
  parent: HTMLElement;
  host: HTMLElement;
  child: HTMLElement;
  hostInjector: Injector;

  constructor() {
    this.global = createGlobal(import.meta.url);
    this.document = this.global.document;
    this.superParent = this.document.createElement('super-parent');
    this.parent = this.document.createElement('parent');
    this.host = this.document.createElement('host');
    this.child = this.document.createElement('child');
    this.hostInjector = new ElementInjector(this.child);
    this.superParent.appendChild(this.parent);
    this.parent.appendChild(this.host);
    this.host.appendChild(this.child);
  }
}
