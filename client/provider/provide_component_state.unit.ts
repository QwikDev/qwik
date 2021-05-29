/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ComponentFixture } from '../testing/component_fixture.js';
import { provideComponentState } from './provide_component_state.js';

describe('provideComponentState', () => {
  it('should return undefined if no state defined', () => {
    const fixture = new ComponentFixture();
    expect(provideComponentState(false)(fixture.injector)).to.equal(undefined);
  });

  it('should return state', () => {
    const fixture = new ComponentFixture();
    fixture.host.setAttribute(':.', JSON.stringify({ value: 'worked' }));
    expect(provideComponentState(false)(fixture.injector)).to.eql({
      value: 'worked',
    });
  });

  it('should inject empty state', () => {
    const fixture = new ComponentFixture();
    expect(() => provideComponentState()(fixture.injector)).to.throw(
      "Can't find state on host element."
    );
  });

  it('should inject JSON state', () => {
    const fixture = new ComponentFixture();
    const state = { prop: 'value' };
    fixture.host.setAttribute('::', './qrl');
    fixture.host.setAttribute(':.', JSON.stringify(state));
    expect(provideComponentState()(fixture.injector)).to.eql(state);
  });
});
