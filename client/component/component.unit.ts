/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ComponentFixture } from '../testing/component_fixture.js';
import { Component } from './component.js';

describe('component', () => {
  it('should declare a component', () => {
    const fixture = new ComponentFixture();
    class MyComponent extends Component<'props', 'state'> {}
    const myComponent = MyComponent.new({ host: fixture.host, state: 'state', props: 'props' });
    expect(myComponent).to.eql({
      $state: 'state',
      $props: 'props',
      $host: fixture.host,
    });
  });

  it('should call $init state', () => {
    const fixture = new ComponentFixture();
    class MyComponent extends Component<'props', 'state'> {
      $initState(props: 'props'): 'state' {
        return 'state';
      }
    }
    const myComponent = MyComponent.new({ host: fixture.host, state: undefined, props: 'props' });
    expect(myComponent).to.eql({
      $state: 'state',
      $props: 'props',
      $host: fixture.host,
    });
  });
});
