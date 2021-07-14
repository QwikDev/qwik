/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { getInjector } from '../injector/element_injector';
import { ComponentFixture } from '@builder.io/qwik/testing';
import { provideComponentProp } from './provide_component_prop';

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

    expect(provideComponentProp('propA')(injector)).toEqual('valueA');
    expect(provideComponentProp('$propB')(injector)).toEqual('id:1');
    expect(provideComponentProp('$propC')(injector)).toEqual('id:2');
    expect(provideComponentProp('$propD')(injector)).toEqual('id:2');
  });

  describe('error', () => {
    it('should throw if property not defined', () => {
      const injector = getInjector(fixture.host);
      expect(() => provideComponentProp('propA')(injector)).toThrow(
        "COMPONENT-ERROR(Q-404): Property 'propA' not found in '{}' on component '<host : decl:template='file://.../component_fixture.noop'>'."
      );
    });
  });
});
