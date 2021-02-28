/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { inject } from '../injection/inject.js';
import { ComponentFixture } from '../testing/component_fixture.js';
import { provideProps } from './provide_props.js';

describe('provideComponentState', () => {
  it('should inject empty state', () => {
    const fixture = new ComponentFixture();
    const handler = inject(null, provideProps<{}>(), (props) => props);
    fixture.host.setAttribute('salutation', 'Hello');

    expect(handler.call(fixture.injectionContext)).to.eql({ salutation: 'Hello' });
  });
});
