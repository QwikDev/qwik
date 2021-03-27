/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { getInjector } from '../injection/element_injector.js';
import { injectFunction } from '../injection/inject.js';
import { ComponentFixture } from '../testing/component_fixture.js';
import { provideComponentProps } from './provide_component_props.js';

describe('provideComponentState', () => {
  it('should inject empty state', async () => {
    const fixture = new ComponentFixture();
    const handler = injectFunction(provideComponentProps<{}>(), (props) => {
      return props;
    });
    fixture.host.setAttribute('salutation', 'Hello');
    const injector = getInjector(fixture.host);

    expect(await injector.invoke(handler)).to.eql({ salutation: 'Hello' });
  });
});
