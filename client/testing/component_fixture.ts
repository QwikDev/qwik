/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { createComponentInjector } from '../injection/element_injector.js';
import { QRL } from '../qoot.js';
import { jsxRender } from '../render/jsx/render.js';
import { JSXFactory } from '../render/jsx/types.js';
import { HostElements } from '../render/types.js';
import { ServiceFixture } from './service_fixture.js';

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
 * It also sets up `injector` which points to `child`.
 *
 */
export class ComponentFixture extends ServiceFixture {
  template: JSXFactory | null = null;

  constructor() {
    super();
    this.injector = createComponentInjector(this.host, null);
    this.host.setAttribute('::', String(QRL`${import.meta.url.replace(/\.js$/, '.noop')}`));
  }

  render(): Promise<HostElements> | null {
    if (this.template) {
      return jsxRender(
        this.host,
        this.template.call(this.injector, this.injector.props!),
        this.document
      );
    }
    return null;
  }
}

/**
 * Noop rendering used by `ComponentFixture`.
 */
export const noop = function () {};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'test-component': any;
    }
  }
}
