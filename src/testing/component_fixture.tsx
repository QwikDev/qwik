/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import type { HostElements, Injector, JSXFactory } from '@builder.io/qwik';
import { getInjector, jsxRender, QRL } from '@builder.io/qwik';
import { AttributeMarker } from '../core/util/markers';
import { ElementFixture, ElementFixtureOptions } from './element_fixture';
import { toFileUrl } from './util';

/**
 * Creates a simple DOM structure for testing components.
 *
 * By default `ComponentFixture` creates:
 *
 * ```
 * <host decl:template="./component_fixture.noop">
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

  constructor(options?: ElementFixtureOptions) {
    super(options);
    this.host.setAttribute(
      AttributeMarker.ComponentTemplate,
      String(QRL`${toFileUrl(__filename).replace(/\.(js|ts|tsx)$/, '.noop')}`)
    );
    this.injector = getInjector(this.host);
  }

  render(): Promise<HostElements> | null {
    if (this.template) {
      const injector = getInjector(this.host);
      return jsxRender(this.host, this.template.call(injector, injector.elementProps));
    }
    return null;
  }
}

/**
 * Noop rendering used by `ComponentFixture`.
 */
export const noop = function () {};
