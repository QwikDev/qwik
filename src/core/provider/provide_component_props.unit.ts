/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { getInjector } from '../injector/element_injector';
import { injectFunction } from '../injector/inject';
import { ComponentFixture } from '@builder.io/qwik/testing';
import { provideComponentProps } from './provide_component_props';

describe('provideComponentState', () => {
  it('should inject empty state', async () => {
    const fixture = new ComponentFixture();
    const handler = injectFunction(provideComponentProps<{}>(), (props) => {
      return props;
    });
    fixture.host.setAttribute('salutation', 'Hello');
    const injector = getInjector(fixture.host);

    expect(await injector.invoke(handler)).toEqual({ salutation: 'Hello' });
  });
});
