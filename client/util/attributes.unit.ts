/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { ElementFixture } from '../testing/element_fixture.js';
import { extractPropsFromElement } from './attributes.js';

describe('attributes', () => {
  describe('extractPropsFromElement', () => {
    it('should read attributes', () => {
      const fixture = new ElementFixture();
      fixture.host.setAttribute('key', 'value');
      fixture.host.setAttribute('name', 'Qoot');
      expect(extractPropsFromElement(fixture.host)).to.eql({
        key: 'value',
        name: 'Qoot',
      });
    });
    it('should read bindings', () => {
      const fixture = new ElementFixture();
      fixture.host.setAttribute('bind:value', '$key');
      fixture.host.setAttribute('bind:value2', '$keyA;$keyB');
      expect(extractPropsFromElement(fixture.host)).to.eql({
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
      expect(extractPropsFromElement(fixture.host)).to.eql({});
    });

    describe('error', () => {
      it('should throw if binding has no key', () => {
        const fixture = new ElementFixture();
        fixture.host.setAttribute('bind:value', '');
        expect(() => extractPropsFromElement(fixture.host)).to.throw(
          `COMPONENT-ERROR(Q-401): 'bind:id' must have a property name. (Example: 'bind:key="propertyName"').`
        );
      });
      it('should throw if binding has no value', () => {
        const fixture = new ElementFixture();
        fixture.host.setAttribute('bind:', '$key');
        expect(() => extractPropsFromElement(fixture.host)).to.throw(
          `COMPONENT-ERROR(Q-400): 'bind:' must have an key. (Example: 'bind:key="propertyName"').`
        );
      });
    });
  });
});
