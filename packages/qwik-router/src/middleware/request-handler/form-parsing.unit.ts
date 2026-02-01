import { describe, it, expect } from 'vitest';
import { formToObj } from './request-event';

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
});
