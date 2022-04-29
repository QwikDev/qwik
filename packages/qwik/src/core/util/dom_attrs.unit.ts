import { QError } from '../error/error';
import { ElementFixture } from '@builder.io/qwik/testing';
import { findAttribute } from './dom_attrs';

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
      ).toEqual({
        element: fixture.parent,
        key: 'primary',
        value: 'primaryValue',
      });
    });
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
      ).toEqual({
        element: fixture.parent,
        key: 'secondary',
        value: 'secondaryValue',
      });
    });
    describe('error', () => {
      it('should throw error if primary attribute not found', () => {
        const fixture = new ElementFixture();
        expect(() =>
          findAttribute(fixture.host, QError.Core_noAttribute_atr1_element, 'primary', () => null)
        ).toThrow(
          `ERROR(Q-003): Could not find entity state 'primary' at '<host>' or any of it's parents.`
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
        ).toThrow(
          `ERROR(Q-004): Could not find entity state 'primary' ( or entity provider 'secondary') at '<host>' or any of it's parents.`
        );
      });
    });
  });
});
