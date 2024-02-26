import { describe } from 'node:test';
import { ComponentStylesPrefixContent } from '../../util/markers';
import { expect, it } from 'vitest';
import {
  addPrefixForScopedStyleIdsString,
  convertScopedStyleIdsToArray as convertStyleIdsToArray,
  convertStyleIdsToString,
  getScopedStyleIdsAsPrefix,
} from './scoped-styles';

describe('scoped styles utils', () => {
  describe('getScopedStyleIdsAsPrefix', () => {
    it('should generate style ids prefix', () => {
      const styleIds = new Set(['abcd', 'dcba', 'test']);
      const prefixedStyleIds = `${ComponentStylesPrefixContent}abcd ${ComponentStylesPrefixContent}dcba ${ComponentStylesPrefixContent}test`;
      expect(getScopedStyleIdsAsPrefix(styleIds)).toEqual(prefixedStyleIds);
    });
  });

  describe('convertStyleIdsToArray', () => {
    it('should convert style ids string to array', () => {
      expect(convertStyleIdsToArray('abcd dcba test')).toEqual(['abcd', 'dcba', 'test']);
    });

    it('should return null for undefined input', () => {
      expect(convertStyleIdsToArray()).toEqual(null);
    });
  });

  describe('convertStyleIdsToString', () => {
    it('should convert style ids set to string', () => {
      expect(convertStyleIdsToString(new Set(['abcd', 'dcba', 'test']))).toEqual('abcd dcba test');
    });
  });

  describe('addPrefixForScopedStyleIdsString', () => {
    it('should add prefix to style ids', () => {
      expect(addPrefixForScopedStyleIdsString('abcd dcba test')).toEqual(
        `${ComponentStylesPrefixContent}abcd ${ComponentStylesPrefixContent}dcba ${ComponentStylesPrefixContent}test`
      );
    });
  });
});
