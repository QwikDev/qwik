import { suite, test, assert } from 'vitest';
import { serializeClass, serializeClassWithHost } from './execute-component';
import type { QContext } from '../state/context';

const obj = {
  foo: false,
  bar: true,
  'foo-bar': null,
  'foo-baz': undefined,
  'bar-foo': '',
  'bar-baz': 'bar-baz',
  'baz-foo': 0,
  'baz-bar': 1,
};

suite('serializeClass', () => {
  test('should serialize undefined', () => {
    assert.equal(serializeClass(undefined), '');
  });

  test('should serialize null', () => {
    assert.equal(serializeClass(null), '');
  });

  suite('string values', () => {
    test('should serialize empty string', () => {
      assert.equal(serializeClass(''), '');
    });

    test('should serialize string with no whitespace', () => {
      assert.equal(serializeClass('foo'), 'foo');
    });

    test('should serialize multiple classes', () => {
      assert.equal(serializeClass('foo bar'), 'foo bar');
      assert.equal(serializeClass('foo bar baz'), 'foo bar baz');
    });
  });

  test('should serialize boolean', () => {
    assert.equal(serializeClass(false), '');
    assert.equal(serializeClass(true as any), '');
  });

  suite('should serialize object', () => {
    test('should serialize empty object', () => {
      assert.equal(serializeClass({}), '');
    });

    test('should serialize object with single boolean value', () => {
      assert.equal(serializeClass({ foo: true }), 'foo');
      assert.equal(serializeClass({ foo: false }), '');
    });

    test('should serialize object with single number value', () => {
      assert.equal(serializeClass({ foo: 1 }), 'foo');
      assert.equal(serializeClass({ foo: 0 }), '');
      assert.equal(serializeClass({ foo: -1 }), 'foo');
    });

    test('should serialize object with single string value', () => {
      assert.equal(serializeClass({ foo: 'bar' }), 'foo');
      assert.equal(serializeClass({ foo: '' }), '');
    });

    test('should serialize object with nullish values', () => {
      assert.equal(serializeClass({ foo: null }), '');
      assert.equal(serializeClass({ foo: undefined }), '');
    });

    test('should serialize object with non-string keys', () => {
      assert.equal(serializeClass({ 1: true }), '1');
      assert.equal(serializeClass({ 0: true }), '0');
      assert.equal(serializeClass({ 1: false }), '');
      assert.equal(serializeClass({ 0: false }), '');
    });

    test('should serialize object with key with dashes', () => {
      assert.equal(serializeClass({ 'foo-bar': true }), 'foo-bar');
      assert.equal(serializeClass({ 'foo-bar foo-baz': true }), 'foo-bar foo-baz');
    });

    test('should serialize object with multitude of values', () => {
      assert.equal(serializeClass(obj), 'bar bar-baz baz-bar');
    });
  });

  suite('should serialize array', () => {
    test('should serialize empty array', () => {
      assert.equal(serializeClass([]), '');
    });

    test('should serialize array with single boolean value', () => {
      assert.equal(serializeClass([true as any]), '');
      assert.equal(serializeClass([false]), '');
    });

    test('should ignore nullish values', () => {
      assert.equal(serializeClass([null, undefined]), '');
      let test: boolean | undefined = false;
      assert.equal(serializeClass([test && 'foo', 'bar']), 'bar');
      test = true;
      assert.equal(serializeClass([test && 'foo', 'bar']), 'foo bar');
      test = undefined;
      assert.equal(serializeClass([test && 'foo', 'bar']), 'bar');
    });

    test('should serialize array with string values', () => {
      assert.equal(serializeClass(['foo']), 'foo');
      assert.equal(serializeClass(['foo', 'bar']), 'foo bar');
      assert.equal(serializeClass(['foo', 'bar', 'baz']), 'foo bar baz');
    });

    test('should serialize array with object values', () => {
      assert.equal(serializeClass([{ foo: true }]), 'foo');
      assert.equal(serializeClass([{ foo: false }]), '');
      assert.equal(serializeClass([{ foo: true }, { bar: true }]), 'foo bar');
      assert.equal(serializeClass([{ foo: true }, { bar: false }]), 'foo');
      assert.equal(serializeClass([{ foo: true }, { bar: false }, { baz: true }]), 'foo baz');
      assert.equal(serializeClass([obj]), 'bar bar-baz baz-bar');
      assert.equal(serializeClass([obj, obj]), 'bar bar-baz baz-bar bar bar-baz baz-bar');
    });

    test('should serialize array with mixed values', () => {
      const test = false;
      assert.equal(serializeClass(['foo', { bar: true }]), 'foo bar');
      assert.equal(serializeClass([{ foo: test }, 'bar']), 'bar');
      assert.equal(serializeClass([test && 'foo', { bar: test, baz: true }]), 'baz');
      assert.equal(
        serializeClass([test && 'foo', { bar: test, baz: true }, obj]),
        'baz bar bar-baz baz-bar'
      );
    });
  });

  test('should trim classes', () => {
    assert.equal(serializeClass('foo '), 'foo');
    assert.equal(serializeClass(' foo '), 'foo');
    assert.equal(serializeClass(' foo'), 'foo');
    assert.equal(serializeClass(' foo bar '), 'foo bar');
    assert.equal(serializeClass({ ' foo ': true, '  bar ': true }), 'foo bar');
    assert.equal(serializeClass(['  foo   ', '    bar  ', { ' baz  ': true }]), 'foo bar baz');
  });
});

suite('serializeClassWithHost', () => {
  test('should serialize null context', () => {
    assert.equal(serializeClassWithHost(obj, null), 'bar bar-baz baz-bar');
  });

  test('should serialize undefined context', () => {
    assert.equal(serializeClassWithHost(obj, undefined), 'bar bar-baz baz-bar');
  });

  test('should serialize empty context', () => {
    assert.equal(serializeClassWithHost(obj, {} as QContext), 'bar bar-baz baz-bar');
  });

  test('should serialize context with empty $scopeIds$', () => {
    assert.equal(
      serializeClassWithHost(obj, { $scopeIds$: [] as string[] } as QContext),
      'bar bar-baz baz-bar'
    );
  });

  test('should serialize context with one item in $scopeIds$', () => {
    assert.equal(
      serializeClassWithHost(obj, { $scopeIds$: ['foo'] } as QContext),
      'foo bar bar-baz baz-bar'
    );
  });

  test('should serialize context with multiple items in $scopeIds$', () => {
    assert.equal(
      serializeClassWithHost(obj, { $scopeIds$: ['foo', 'baz'] } as QContext),
      'foo baz bar bar-baz baz-bar'
    );
  });
});
