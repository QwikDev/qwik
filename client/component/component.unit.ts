/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import '../CONFIG.js';
import { expect } from 'chai';
import { QRL } from '../import/qrl.js';
import { ComponentFixture } from '../testing/component_fixture.js';
import { AttributeMarker } from '../util/markers.js';
import { Component } from './component.js';
import { injectMethod } from '../injection/inject.js';

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
    expect(greeter).to.eql({
      $props: { salutation: 'Hello', name: 'World' },
      $state: { greeting: 'Hello World!' },
      $host: fixture.host,
    });
  });

  it('should call $init state', () => {
    const fixture = new ComponentFixture();
    class MyComponent extends Component<'props', 'state'> {
      async $materializeState(props: 'props'): Promise<'state'> {
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

export interface GreeterProps {
  salutation: string;
  name: string;
}

export interface GreeterState {
  greeting: string;
}

export class GreeterComponent extends Component<GreeterProps, GreeterState> {
  static $templateQRL = QRL`test:/component/component.unit.greeterTemplate`;
  async $materializeState(props: GreeterProps): Promise<GreeterState> {
    return { greeting: props.salutation + ' ' + props.name + '!' };
  }
  async greet() {}
}

export function greeterTemplate() {}

export const greet = injectMethod(GreeterComponent, function (this: GreeterComponent) {
  return this.$state.greeting;
});
