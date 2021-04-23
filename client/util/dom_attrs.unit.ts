/**
 * @license
 * Copyright a-Qoot All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/a-Qoot/qoot/blob/main/LICENSE
 */

import { expect } from 'chai';
import { QError } from '../error/error.js';
import { ElementFixture } from '../testing/element_fixture.js';
import { findAttribute } from './dom_attrs.js';

describe('dom_attrs', () => {
  describe('findAttribute', () => {
    it('should find one attr', () => {
      const fixture = new ElementFixture();
      fixture.parent.setAttribute('primary', 'primaryValue');
      expect(
        findAttribute(
          fixture.child,
          QError.Core_noAttribute_atr1_element,
          'primary',
          (element, key, value) => ({
            element,
            key,
            value,
          })
        )
      ).to.eql({
        element: fixture.parent,
        key: 'primary',
        value: 'primaryValue',
      });
    });
    it('should find either attr', () => {
      it('should find one attr', () => {
        const fixture = new ElementFixture();
        fixture.parent.setAttribute('secondary', 'secondaryValue');
        expect(
          findAttribute(
            fixture.child,
            QError.Core_noAttribute_atr1_element,
            'primary',
            () => null,
            'secondary',
            (element, key, value) => ({
              element,
              key,
              value,
            })
          )
        ).to.eql({
          element: fixture.parent,
          key: 'secondary',
          value: 'secondaryValue',
        });
      });
    });
    describe('error', () => {
      it('should throw error if primary attribute not found', () => {
        const fixture = new ElementFixture();
        expect(() =>
          findAttribute(fixture.host, QError.Core_noAttribute_atr1_element, 'primary', () => null)
        ).to.throw(
          `ERROR(Q-003): Could not find service state 'primary' at '<host>' or any of it's parents.`
        );
      });
      it('should throw error if primary attribute not found', () => {
        const fixture = new ElementFixture();
        expect(() =>
          findAttribute(
            fixture.host,
            QError.Core_noAttribute_atr1_attr2_element,
            'primary',
            () => null,
            'secondary',
            () => null
          )
        ).to.throw(
          `ERROR(Q-004): Could not find service state 'primary' ( or service provider 'secondary') at '<host>' or any of it's parents.`
        );
      });
    });
  });
});
