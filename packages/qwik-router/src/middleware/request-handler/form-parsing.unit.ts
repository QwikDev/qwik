import { describe, it, expect } from 'vitest';
import { formToObj } from './request-event-core';

describe('formToObj', () => {
  describe('Object prototype pollution', () => {
    it('blocks __proto__ pollution via dotted notation', () => {
      delete (Object.prototype as any).polluted;

      const fd = new FormData();
      fd.append('__proto__.polluted', '1');

      formToObj(fd);

      expect(({} as any).polluted).toBeUndefined();

      delete (Object.prototype as any).polluted;
    });

    it('blocks __proto__[] pollution via array notation', () => {
      delete (Object.prototype as any).polluted;

      const fd = new FormData();
      fd.append('__proto__[]', 'x');

      const res = formToObj(fd);

      expect(({} as any).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(res, '__proto__')).toBe(false);

      delete (Object.prototype as any).polluted;
    });

    it('uses Object.create(null) for root object', () => {
      const fd = new FormData();
      fd.append('__proto__.polluted', 'yes');
      fd.append('normal', 'ok');

      const obj = formToObj(fd);

      expect((Object.prototype as any).polluted).toBeUndefined();

      expect((obj as any).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(obj, '__proto__')).toBe(false);

      expect(obj.normal).toBe('ok');

      expect(Object.getPrototypeOf(obj)).toBeNull();
    });

    it('blocks constructor pollution attempts', () => {
      const fd = new FormData();
      fd.append('constructor.polluted', 'bad');
      fd.append('safe', 'good');

      const obj = formToObj(fd);

      expect((obj as any).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(obj, 'constructor')).toBe(false);
      expect(obj.safe).toBe('good');
    });

    it('blocks prototype pollution attempts', () => {
      const fd = new FormData();
      fd.append('prototype.polluted', 'bad');
      fd.append('safe', 'good');

      const obj = formToObj(fd);

      expect((obj as any).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(obj, 'prototype')).toBe(false);
      expect(obj.safe).toBe('good');
    });

    it('blocks nested dangerous keys in middle of path', () => {
      const fd = new FormData();
      fd.append('user.__proto__.isAdmin', 'true');
      fd.append('user.name', 'alice');

      const obj = formToObj(fd);

      // The dangerous entry is skipped
      expect((obj as any).isAdmin).toBeUndefined();
      expect((Object.prototype as any).isAdmin).toBeUndefined();
      expect(obj.user?.isAdmin).toBeUndefined();

      // The safe entry is processed normally
      expect(obj.user?.name).toBe('alice');
    });

    it('blocks constructor[] array notation', () => {
      const fd = new FormData();
      fd.append('constructor[]', 'bad');
      fd.append('safe', 'good');

      const obj = formToObj(fd);

      expect(Object.prototype.hasOwnProperty.call(obj, 'constructor')).toBe(false);
      expect(obj.safe).toBe('good');
    });

    it('blocks prototype[] array notation', () => {
      const fd = new FormData();
      fd.append('prototype[]', 'bad');
      fd.append('safe', 'good');

      const obj = formToObj(fd);

      expect(Object.prototype.hasOwnProperty.call(obj, 'prototype')).toBe(false);
      expect(obj.safe).toBe('good');
    });

    it('handles nested objects without creating {} with prototype', () => {
      const fd = new FormData();
      fd.append('user.profile.name', 'alice');

      const obj = formToObj(fd);

      expect(Object.getPrototypeOf(obj)).toBeNull();
      expect(Object.getPrototypeOf(obj.user)).toBeNull();
      expect(Object.getPrototypeOf(obj.user.profile)).toBeNull();
      expect(obj.user.profile.name).toBe('alice');
    });
  });

  describe('Array parsing', () => {
    it('creates arrays only for canonical non-negative integer keys', () => {
      const fd = new FormData();
      fd.append('items.0', 'apple');
      fd.append('items.1', 'banana');
      fd.append('notArray.-1', 'neg');
      fd.append('alsoNotArray.01', 'leading-zero');
      fd.append('stillNotArray.1e2', 'scientific');

      const obj = formToObj(fd);

      expect(Array.isArray(obj.items)).toBe(true);
      expect(obj.items).toEqual(['apple', 'banana']);

      expect(Array.isArray(obj.notArray)).toBe(false);
      expect(obj.notArray['-1']).toBe('neg');

      expect(Array.isArray(obj.alsoNotArray)).toBe(false);
      expect(obj.alsoNotArray['01']).toBe('leading-zero');

      expect(Array.isArray(obj.stillNotArray)).toBe(false);
      expect(obj.stillNotArray['1e2']).toBe('scientific');
    });

    it('keeps object syntax object-shaped when sibling keys are mixed', () => {
      const fd = new FormData();
      fd.append('items.0', 'apple');
      fd.append('items.1', 'banana');
      fd.append('items.hello', 'there');

      const obj = formToObj(fd);

      expect(Array.isArray(obj.items)).toBe(false);
      expect(obj.items[0]).toBe('apple');
      expect(obj.items[1]).toBe('banana');
      expect(obj.items.hello).toBe('there');
    });

    it('ignores non-integer keys on arrays', () => {
      const fd = new FormData();
      fd.append('items.0', 'apple');
      fd.append('items.1', 'banana');
      fd.append('items.hello', 'there');

      const obj = formToObj(fd);

      expect(Array.isArray(obj.items)).toBe(false);
      expect(obj.items[0]).toBe('apple');
      expect(obj.items[1]).toBe('banana');
      expect(obj.items.hello).toBe('there');
    });

    it('still supports explicit [] syntax for arrays', () => {
      const fd = new FormData();
      fd.append('items[]', 'apple');
      fd.append('items[]', 'banana');

      const obj = formToObj(fd);

      expect(Array.isArray(obj.items)).toBe(true);
      expect(obj.items).toEqual(['apple', 'banana']);
      expect(obj.items.length).toBe(2);
    });
  });
});
