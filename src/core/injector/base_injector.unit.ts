/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { Component } from '../component/component';
import type { QRL } from '../import/qrl';
import { ElementFixture } from '@builder.io/qwik/testing';
import { AttributeMarker } from '../util/markers';
import { getInjector } from './element_injector';
import { injectFunction, injectMethod } from './inject';
import type { Injector, Provider } from './types';

describe('BaseInjector', () => {
  let fixture: ElementFixture;
  let hostInjector: Injector;
  beforeEach(() => {
    fixture = new ElementFixture();
    hostInjector = getInjector(fixture.host);
  });
  describe('getParent', () => {
    it('should return no parent', () => {
      expect(hostInjector.getParent()).toEqual(null);
    });
    it('should return no parent', () => {
      expect(hostInjector.getParent()).toEqual(null);
    });
    it('should return parent skipping elements with no injectors', () => {
      fixture.superParent.setAttribute(AttributeMarker.Injector, '');
      expect(hostInjector.getParent()!.element).toEqual(fixture.superParent);
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
          } as any,
          null,
          'arg'
        )
      ).toEqual('ret');
      expect(log).toEqual([null, 'arg']);
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
      expect(await hostInjector.invoke(injectedFn, null, 'extra')).toEqual('ret');
      expect(log).toEqual([null, 'self', 'arg0', 'extra']);
    });

    it('should call injected function (as default)', async () => {
      const log: (string | null)[] = [];
      const injectedFn = injectFunction(
        provideConst('self'), //
        provideConst('arg0'),
        function (this: null, arg0: string, arg1: string, arg2: string) {
          log.push(this, arg0, arg1, arg2);
          return 'ret';
        }
      );
      expect(await hostInjector.invoke({ default: injectedFn } as any, null, 'extra')).toEqual(
        'ret'
      );
      expect(log).toEqual([null, 'self', 'arg0', 'extra']);
    });

    it('should call injected method', async () => {
      const log: (string | MyComponent)[] = [];
      fixture.host.setAttribute(AttributeMarker.ComponentTemplate, String(MyComponentTemplate));
      const injectedFn = injectMethod(
        MyComponent,
        provideConst('arg0'), //
        provideConst('arg1'),
        function (this: MyComponent, arg0: string, arg1: string, arg2: string) {
          log.push(this, arg0, arg1, arg2);
          return 'ret';
        }
      );
      expect(await hostInjector.invoke(injectedFn, null, 'arg2')).toEqual('ret');
      expect(log).toEqual([
        { $host: fixture.host, $props: {}, $state: {} },
        'arg0',
        'arg1',
        'arg2',
      ]);
    });

    it('should call injected method (as default)', async () => {
      const log: (string | MyComponent)[] = [];
      fixture.host.setAttribute(AttributeMarker.ComponentTemplate, String(MyComponentTemplate));
      const injectedFn = injectMethod(
        MyComponent,
        provideConst('arg0'), //
        provideConst('arg1'),
        function (this: MyComponent, arg0: string, arg1: string, arg2: string) {
          log.push(this, arg0, arg1, arg2);
          return 'ret';
        }
      );
      expect(await hostInjector.invoke({ default: injectedFn } as any, null, 'arg2')).toEqual(
        'ret'
      );
      expect(log).toEqual([
        { $host: fixture.host, $props: {}, $state: {} },
        'arg0',
        'arg1',
        'arg2',
      ]);
    });

    describe('error', () => {
      it('should include declare context when throwing error', async () => {
        fixture.host.setAttribute(AttributeMarker.ComponentTemplate, String(MyComponentTemplate));
        const injectedFn = injectMethod(
          MyComponent,
          () => Promise.reject('ProviderRejection'),
          function () {}
        );
        try {
          await hostInjector.invoke(injectedFn, null, 'arg2');
          expect('should not get here').toBe(false);
        } catch (e) {
          expect(String(e)).toContain('ProviderRejection');
          expect(e.stack).toMatch(/DECLARED .*base_injector\.unit/);
        }
      });
    });
  });

  describe('invoke', () => {
    it('should call injected method', async () => {
      const myClass = new MyClass();
      const injectedFn = injectMethod(
        MyClass, //
        provideConst('arg0'),
        function (this: MyClass, arg0: string, arg1: string) {
          expect(this).toEqual(myClass);
          expect(arg0).toEqual('arg0');
          expect(arg1).toEqual('extra');
          return 'ret';
        }
      );
      expect(await hostInjector.invoke(injectedFn, myClass, 'extra')).toEqual('ret');
    });

    describe('error', () => {
      it('should error if incorrect self passed', async () => {
        class WrongType {}
        const injectedFn = injectMethod(
          MyClass, //
          function (this: MyClass) {}
        );
        expect(() => hostInjector.invoke(injectedFn, new WrongType())).toThrow(
          "INJECTOR-ERROR(Q-203): Expected injection 'this' to be of type 'MyClass', but was of type 'WrongType'."
        );
      });
    });
  });
  describe('getComponentProps', () => {
    it('should retrieve props from attributes', () => {
      fixture.host.setAttribute('prop-A', 'valueA');
      fixture.host.setAttribute('bind:id:1', '$propB');
      fixture.host.setAttribute('bind:id:2', '$propC;$prop-d');
      expect(hostInjector.elementProps).toEqual({
        propA: 'valueA',
        $propB: 'id:1',
        $propC: 'id:2',
        '$prop-d': 'id:2',
      });
    });
    describe('error', () => {
      it('should error if bind: without suffix', async () => {
        fixture.host.setAttribute('bind:', 'propA');
        expect(() => hostInjector.elementProps).toThrow(
          "COMPONENT-ERROR(Q-400): 'bind:' must have an key. (Example: 'bind:key=\"propertyName\"')."
        );
      });
      it('should error if bind: without content', () => {
        fixture.host.setAttribute('bind:id', '');
        expect(() => hostInjector.elementProps).toThrow(
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

const MyComponentTemplate = 'test:/injector/base_injector.unit#template' as any as QRL;
class MyComponent extends Component<any, any> {
  $newState() {
    return {};
  }
}
