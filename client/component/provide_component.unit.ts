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
  it('should inject empty state', () => {
    const fixture = new ComponentFixture();
    expect(() => provideComponentState().apply(fixture.injectionContext)).to.throw(
      "Can't find state on host element."
    );
  });

  it('should inject JSON state', () => {
    const fixture = new ComponentFixture();
    const state = { prop: 'value' };
    fixture.host.setAttribute('::', './qrl');
    fixture.host.setAttribute(':.', JSON.stringify(state));
    expect(provideComponentState().apply(fixture.injectionContext)).to.eql(state);
  });
});
