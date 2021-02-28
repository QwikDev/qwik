/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ComponentFixture } from '../testing/component_fixture.js';
import { provideComponentState } from './provide_component_state.js';

describe('provideComponentState', () => {
  it('should return undefined if no state defined', () => {
    const fixture = new ComponentFixture();
    expect(provideComponentState(false).apply(fixture.injectionContext)).to.equal(undefined);
  });

  it('should return state', () => {
    const fixture = new ComponentFixture();
    fixture.host.setAttribute(':.', JSON.stringify({ value: 'worked' }));
    expect(provideComponentState(false).apply(fixture.injectionContext)).to.eql({
      value: 'worked',
    });
  });
});
