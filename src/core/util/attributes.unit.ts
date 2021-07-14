/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

import { ElementFixture } from '@builder.io/qwik/testing';
import { extractPropsFromElement } from './attributes';

describe('attributes', () => {
  describe('extractPropsFromElement', () => {
    it('should read attributes', () => {
      const fixture = new ElementFixture();
      fixture.host.setAttribute('key', 'value');
      fixture.host.setAttribute('name', 'Qwik');
      expect(extractPropsFromElement(fixture.host)).toEqual({
        key: 'value',
        name: 'Qwik',
      });
    });
    it('should read bindings', () => {
      const fixture = new ElementFixture();
      fixture.host.setAttribute('bind:value', '$key');
      fixture.host.setAttribute('bind:value2', '$keyA;$keyB');
      expect(extractPropsFromElement(fixture.host)).toEqual({
        $key: 'value',
        $keyA: 'value2',
        $keyB: 'value2',
      });
    });
    it('should ignore special attributes', () => {
      const fixture = new ElementFixture();
      fixture.host.setAttribute(':', '');
      fixture.host.setAttribute(':bar', '');
      fixture.host.setAttribute('foo:', '');
      fixture.host.setAttribute('foo:bar', '');
      expect(extractPropsFromElement(fixture.host)).toEqual({});
    });

    describe('error', () => {
      it('should throw if binding has no key', () => {
        const fixture = new ElementFixture();
        fixture.host.setAttribute('bind:value', '');
        expect(() => extractPropsFromElement(fixture.host)).toThrow(
          `COMPONENT-ERROR(Q-401): 'bind:id' must have a property name. (Example: 'bind:key="propertyName"').`
        );
      });
      it('should throw if binding has no value', () => {
        const fixture = new ElementFixture();
        fixture.host.setAttribute('bind:', '$key');
        expect(() => extractPropsFromElement(fixture.host)).toThrow(
          `COMPONENT-ERROR(Q-400): 'bind:' must have an key. (Example: 'bind:key="propertyName"').`
        );
      });
    });
  });
});
