/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { createComponentInjector } from '../injection/element_injector.js';
import { ComponentFixture } from '../testing/component_fixture.js';
import { provideComponentProp } from './provide_prop.js';

describe('getComponentProps', () => {
  let fixture: ComponentFixture;
  beforeEach(() => {
    fixture = new ComponentFixture();
  });

  it('should retrieve props from attributes', () => {
    fixture.host.setAttribute('prop-A', 'valueA');
    fixture.host.setAttribute('bind:id:1', '$propB');
    fixture.host.setAttribute('bind:id:2', '$propC;$propD');
    fixture.injector = createComponentInjector(fixture.host, null);

    expect(provideComponentProp('propA')(fixture.injector)).to.equal('valueA');
    expect(provideComponentProp('$propB')(fixture.injector)).to.equal('id:1');
    expect(provideComponentProp('$propC')(fixture.injector)).to.equal('id:2');
    expect(provideComponentProp('$propD')(fixture.injector)).to.equal('id:2');
  });

  describe('error', () => {
    it('should throw if property not defined', () => {
      expect(() => provideComponentProp('propA')(fixture.injector)).to.throw(
        `COMPONENT-ERROR(Q-404): Property 'propA' not found on component '<host : ::='file://.../component_fixture.noop'>'.`
      );
    });
  });
});
