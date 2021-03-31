/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { getInjector } from '../injector/element_injector.js';
import { Injector } from '../injector/types.js';
import { QRL } from '../index.js';
import { jsxRender } from '../render/jsx/render.js';
import { JSXFactory } from '../render/jsx/types.js';
import { HostElements } from '../render/types.js';
import { ElementFixture } from './element_fixture.js';

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
export class ComponentFixture extends ElementFixture {
  template: JSXFactory | null = null;
  injector: Injector;

  constructor() {
    super();
    this.host.setAttribute('::', String(QRL`${import.meta.url.replace(/\.js$/, '.noop')}`));
    this.injector = getInjector(this.host);
  }

  render(): Promise<HostElements> | null {
    if (this.template) {
      const injector = getInjector(this.host);
      return jsxRender(
        this.host,
        this.template.call(injector, injector.elementProps),
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
