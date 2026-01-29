import { suite, test, assert } from 'vitest';
import {
  serializeClass,
  serializeClassWithHost,
  stringifyStyle,
  setValueForStyle,
} from './execute-component';
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

suite('stringifyStyle', () => {
  test('should stringify null', () => {
    assert.equal(stringifyStyle(null), '');
  });

  test('should stringify undefined', () => {
    assert.equal(stringifyStyle(undefined), '');
  });

  test('should stringify string', () => {
    assert.equal(stringifyStyle('color: red;'), 'color: red;');
  });

  test('should stringify number', () => {
    assert.equal(stringifyStyle(10), '10');
  });

  test('should stringify boolean', () => {
    assert.equal(stringifyStyle(true), 'true');
    assert.equal(stringifyStyle(false), 'false');
  });

  suite('object values', () => {
    test('should throw an error for array', () => {
      assert.throws(
        () => stringifyStyle([]),
        'Code(0): Error while serializing class or style attributes'
      );
    });

    suite('regular objects', () => {
      test('should stringify object with nullish values', () => {
        assert.equal(stringifyStyle({ color: null, backgroundColor: undefined }), '');
      });

      test('should stringify empty object', () => {
        assert.equal(stringifyStyle({}), '');
      });

      test('should stringify object with single property', () => {
        assert.equal(stringifyStyle({ color: 'red' }), 'color:red');
      });

      test('should stringify object with multiple properties', () => {
        assert.equal(
          stringifyStyle({ color: 'red', 'background-color': 'blue' }),
          'color:red;background-color:blue'
        );
      });

      test('should stringify object with numeric values', () => {
        assert.equal(stringifyStyle({ width: 10, height: 20 }), 'width:10px;height:20px');
      });

      test('should convert camelCase to kebab-case', () => {
        assert.equal(stringifyStyle({ backgroundColor: 'blue' }), 'background-color:blue');
      });

      test('should stringify object with unitless properties', () => {
        assert.equal(stringifyStyle({ lineHeight: 1.5 }), 'line-height:1.5');
      });

      test('should stringify properties that start with two dashes', () => {
        assert.equal(stringifyStyle({ '--foo': 'bar' }), '--foo:bar');
      });

      test('should stringify properties with numeric values that start with two dashes', () => {
        assert.equal(stringifyStyle({ '--foo': 10 }), '--foo:10');
      });
    });

    suite('objects with methods', () => {
      test('should stringify object with own properties only', () => {
        const obj = Object.create({ color: 'red' });
        obj.marginTop = '10em';
        assert.equal(obj.color, 'red');
        assert.equal(stringifyStyle(obj), 'margin-top:10em');
      });

      test('should ignore object methods', () => {
        const obj = {
          margin: () => 10,
          color: 'red',
          backgroundColor: 'blue',
        };
        assert.equal(stringifyStyle(obj), 'color:red;background-color:blue');
      });

      test('should stringify object with custom hasOwnProperty method', () => {
        const obj = {
          hasOwnProperty: () => false,
          color: 'red',
          backgroundColor: 'blue',
        };
        assert.equal(stringifyStyle(obj), 'color:red;background-color:blue');
      });
    });
  });
});

suite('setValueForStyle', () => {
  suite('properties with units', () => {
    test('should not add "px" to numeric zero value (= 0)', () => {
      assert.equal(setValueForStyle('margin', 0), '0');
    });

    test('should add "px" to numeric value that is non-zero (<> 0)', () => {
      assert.equal(setValueForStyle('margin', 10), '10px');
    });

    test('should not add "px" to string zero value (= "0")', () => {
      assert.equal(setValueForStyle('margin', '0'), '0');
    });

    test('should not add "px" to string zero value ending with "px" (= "0px")', () => {
      assert.equal(setValueForStyle('margin', '0px'), '0px');
    });

    test('should not add "px" to string zero value ending with "rem" (= "0rem")', () => {
      assert.equal(setValueForStyle('margin', '0rem'), '0rem');
    });

    test('should not add "px" to string value that is word (= "red")', () => {
      assert.equal(setValueForStyle('color', 'red'), 'red');
    });

    test('should not add "px" to string value that is non-zero ending with "px" (= "10px")', () => {
      assert.equal(setValueForStyle('margin', '10px'), '10px');
    });

    test('should not add "px" to string value that is non-zero ending with "rem" (= "10rem")', () => {
      assert.equal(setValueForStyle('margin', '10rem'), '10rem');
    });
  });

  suite('unitless properties', () => {
    test('should not add "px" to numeric zero value (= 0)', () => {
      assert.equal(setValueForStyle('lineHeight', 0), '0');
    });

    test('should not add "px" to numeric value that is non-zero (<> 0)', () => {
      assert.equal(setValueForStyle('lineHeight', 10), '10');
    });

    test('should not add "px" to string value', () => {
      assert.equal(setValueForStyle('lineHeight', '0'), '0');
      assert.equal(setValueForStyle('lineHeight', '10'), '10');
    });
  });
});
