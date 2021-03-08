/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { createServiceInjector } from '../injection/element_injector.js';
import { dirname, InjectionContext } from '../qoot.js';
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
export class ServiceFixture {
  global: { document: Document };
  document: Document;
  host: HTMLElement;
  child: HTMLElement;
  injector: InjectionContext;

  constructor() {
    const baseUri = import.meta.url;
    // TODO needs config
    const thisFileBaseURI = dirname(baseUri);
    this.global = createGlobal(import.meta.url);
    this.document = this.global.document;
    this.host = this.document.createElement('host');
    this.child = this.document.createElement('child');
    // TODO: I don't think injector should be here???? Who's injector?
    this.injector = createServiceInjector(this.child, {});
    this.host.appendChild(this.child);
  }
}
