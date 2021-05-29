/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { expect } from 'chai';
import { getInjector } from '../injector/element_injector.js';
import { ComponentFixture } from '../testing/component_fixture.js';
import { provideComponentProp } from './provide_component_prop.js';

describe('getComponentProps', () => {
  let fixture: ComponentFixture;
  beforeEach(() => {
    fixture = new ComponentFixture();
  });

  it('should retrieve props from attributes', () => {
    fixture.host.setAttribute('prop-A', 'valueA');
    fixture.host.setAttribute('bind:id:1', '$propB');
    fixture.host.setAttribute('bind:id:2', '$propC;$propD');
    const injector = getInjector(fixture.host);

    expect(provideComponentProp('propA')(injector)).to.equal('valueA');
    expect(provideComponentProp('$propB')(injector)).to.equal('id:1');
    expect(provideComponentProp('$propC')(injector)).to.equal('id:2');
    expect(provideComponentProp('$propD')(injector)).to.equal('id:2');
  });

  describe('error', () => {
    it('should throw if property not defined', () => {
      const injector = getInjector(fixture.host);
      expect(() => provideComponentProp('propA')(injector)).to.throw(
        "COMPONENT-ERROR(Q-404): Property 'propA' not found in '{}' on component '<host : decl:template='file://.../component_fixture.noop'>'."
      );
    });
  });
});
