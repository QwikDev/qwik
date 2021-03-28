/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { Component } from '../component/component.js';
import { ElementFixture } from '../testing/element_fixture.js';
import { AttributeMarker } from '../util/markers.js';
import '../util/qDev.js';
import { ElementInjector, getInjector } from './element_injector.js';
import { injectFunction, injectMethod } from './inject.js';
import { Provider } from './types.js';

describe('BaseInjector', () => {
  let fixture: ElementFixture;
  let hostInjector: ElementInjector;
  beforeEach(() => {
    fixture = new ElementFixture();
    hostInjector = getInjector(fixture.host);
  });
  describe('getParent', () => {
    it('should return no parent', () => {
      expect(hostInjector.getParent()).to.equal(null);
    });
    it('should return no parent', () => {
      expect(hostInjector.getParent()).to.equal(null);
    });
    it('should return parent skipping elements with no injectors', () => {
      fixture.superParent.setAttribute(AttributeMarker.Injector, '');
      expect(hostInjector.getParent()!.element).to.equal(fixture.superParent);
    });
  });

  describe('invoke', () => {
    it('should call normal function', async () => {
      const log: any[] = [];
      expect(
        await hostInjector.invoke(
          function (this: null, arg: string) {
            log.push(this, arg);
            return 'ret';
          },
          null,
          'arg'
        )
      ).to.eql('ret');
      expect(log).to.eql([null, 'arg']);
    });

    it('should call injected function', async () => {
      const log: (string | null)[] = [];
      const injectedFn = injectFunction(
        provideConst('self'), //
        provideConst('arg0'),
        function (this: null, arg0: string, arg1: string, arg2: string) {
          log.push(this, arg0, arg1, arg2);
          return 'ret';
        }
      );
      expect(await hostInjector.invoke(injectedFn, null, 'extra')).to.eql('ret');
      expect(log).to.eql([null, 'self', 'arg0', 'extra']);
    });

    it('should call injected method', async () => {
      const log: (string | MyComponent)[] = [];
      fixture.host.setAttribute(AttributeMarker.ComponentTemplate, MyComponent.$templateQRL);
      const injectedFn = injectMethod(
        MyComponent,
        provideConst('arg0'), //
        provideConst('arg1'),
        function (this: MyComponent, arg0: string, arg1: string, arg2: string) {
          log.push(this, arg0, arg1, arg2);
          return 'ret';
        }
      );
      expect(await hostInjector.invoke(injectedFn, null, 'arg2')).to.eql('ret');
      expect(log).to.eql([
        { $host: fixture.host, $props: {}, $state: null },
        'arg0',
        'arg1',
        'arg2',
      ]);
    });
  });

  describe('invoke', () => {
    it('should call injected method', async () => {
      const myClass = new MyClass();
      const injectedFn = injectMethod(
        MyClass, //
        provideConst('arg0'),
        function (this: MyClass, arg0: string, arg1: string) {
          expect(this).to.eql(myClass);
          expect(arg0).to.eql('arg0');
          expect(arg1).to.eql('extra');
          return 'ret';
        }
      );
      expect(await hostInjector.invoke(injectedFn, myClass, 'extra')).to.eql('ret');
    });

    describe('error', () => {
      it('should error if incorrect self passed', async () => {
        class WrongType {}
        const injectedFn = injectMethod(
          MyClass, //
          function (this: MyClass) {}
        );
        expect(() => hostInjector.invoke(injectedFn, new WrongType())).to.throw(
          "INJECTION-ERROR(Q-203): Expected injection 'this' to be of type 'MyClass', but was of type 'WrongType'."
        );
      });
    });
  });
  describe('getComponentProps', () => {
    it('should retrieve props from attributes', () => {
      fixture.host.setAttribute('prop-A', 'valueA');
      fixture.host.setAttribute('bind:id:1', '$propB');
      fixture.host.setAttribute('bind:id:2', '$propC;$prop-d');
      expect(hostInjector.elementProps).to.eql({
        propA: 'valueA',
        $propB: 'id:1',
        $propC: 'id:2',
        '$prop-d': 'id:2',
      });
    });
    describe('error', () => {
      it('should error if bind: without suffix', async () => {
        fixture.host.setAttribute('bind:', 'propA');
        expect(() => hostInjector.elementProps).to.throw(
          "COMPONENT-ERROR(Q-400): 'bind:' must have an key. (Example: 'bind:key=\"propertyName\"')."
        );
      });
      it('should error if bind: without content', () => {
        fixture.host.setAttribute('bind:id', '');
        expect(() => hostInjector.elementProps).to.throw(
          "COMPONENT-ERROR(Q-401): 'bind:id' must have a property name. (Example: 'bind:key=\"propertyName\"')."
        );
      });
    });
  });
});

function provideConst<T>(value: T): Provider<T> {
  return async () => {
    return value;
  };
}

class MyClass {}

export function template() {}

class MyComponent extends Component<any, any> {
  static $templateQRL = 'test:/injectior/base_injector.unit.template';
}
