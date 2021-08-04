/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ComponentFixture } from '@builder.io/qwik/testing';
import { GreeterComponent, GreeterComponentTemplate } from '../util/test_component_fixture';
import { AttributeMarker } from '../util/markers';
import { Component } from './component';
import { injectMethod } from '../injector/inject';

describe('component', () => {
  it('should declare a component', async () => {
    const fixture = new ComponentFixture();
    fixture.host.setAttribute(AttributeMarker.ComponentTemplate, String(GreeterComponentTemplate));
    fixture.host.setAttribute('salutation', 'Hello');
    fixture.host.setAttribute('name', 'World');
    const greeter = await fixture.injector.getComponent(GreeterComponent);
    expect(greeter.$props).toEqual({ salutation: 'Hello', name: 'World' });
    expect(greeter.$state).toEqual({ greeting: 'Hello World!' });
  });

  it('should call $init state', () => {
    const fixture = new ComponentFixture();
    class MyComponent extends Component<'props', 'state'> {
      async $newState(): Promise<'state'> {
        return 'state';
      }
    }
    const myComponent = new MyComponent(fixture.host, 'props', 'state');
    expect(myComponent).toEqual({
      $state: 'state',
      $props: 'props',
      $host: fixture.host,
    });
  });
});

export const greet = injectMethod(GreeterComponent, function (this: GreeterComponent) {
  return this.$state.greeting;
});
