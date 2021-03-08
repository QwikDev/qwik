/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ComponentFixture } from '../testing/component_fixture.js';
import { createComponentInjector } from './element_injector.js';

describe('getComponentProps', () => {
  let fixture: ComponentFixture;
  beforeEach(() => {
    fixture = new ComponentFixture();
  });

  describe('error', () => {
    it('should error if bind: without suffix', async () => {
      fixture.host.setAttribute('bind:', 'propA');
      expect(() => (fixture.injector = createComponentInjector(fixture.host, null))).to.throw(
        "COMPONENT-ERROR(Q-400): 'bind:' must have an key. (Example: 'bind:key=\"propertyName\"')."
      );
    });
    it('should error if bind: without content', () => {
      fixture.host.setAttribute('bind:id', '');
      expect(() => (fixture.injector = createComponentInjector(fixture.host, null))).to.throw(
        "COMPONENT-ERROR(Q-401): 'bind:id' must have a property name. (Example: 'bind:key=\"propertyName\"')."
      );
    });
  });

  it('should retrieve props from attributes', () => {
    fixture.host.setAttribute('prop-A', 'valueA');
    fixture.host.setAttribute('bind:id:1', '$propB');
    fixture.host.setAttribute('bind:id:2', '$propC;$prop-d');
    fixture.injector = createComponentInjector(fixture.host, null);
    expect(fixture.injector.props).to.eql({
      propA: 'valueA',
      $propB: 'id:1',
      $propC: 'id:2',
      '$prop-d': 'id:2',
    });
  });
});
