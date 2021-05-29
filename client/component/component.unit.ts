/**
 * @license
 * Copyright BuilderIO All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import '../CONFIG.js';
import { expect } from 'chai';
import { ComponentFixture, GreeterComponent } from '../testing/component_fixture.js';
import { AttributeMarker } from '../util/markers.js';
import { Component } from './component.js';
import { injectMethod } from '../injector/inject.js';

describe('component', () => {
  it('should declare a component', async () => {
    const fixture = new ComponentFixture();
    fixture.host.setAttribute(
      AttributeMarker.ComponentTemplate,
      String(GreeterComponent.$templateQRL)
    );
    fixture.host.setAttribute('salutation', 'Hello');
    fixture.host.setAttribute('name', 'World');
    const greeter = await fixture.injector.getComponent(GreeterComponent);
    expect(greeter.$props).to.eql({ salutation: 'Hello', name: 'World' });
    expect(greeter.$state).to.eql({ greeting: 'Hello World!' });
  });

  it('should call $init state', () => {
    const fixture = new ComponentFixture();
    class MyComponent extends Component<'props', 'state'> {
      async $newState(): Promise<'state'> {
        return 'state';
      }
    }
    const myComponent = new MyComponent(fixture.host, 'props', 'state');
    expect(myComponent).to.eql({
      $state: 'state',
      $props: 'props',
      $host: fixture.host,
    });
  });
});

export const greet = injectMethod(GreeterComponent, function (this: GreeterComponent) {
  return this.$state.greeting;
});
