import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { decodeParamsFromUrl, encodeParamsToUrl } from './url-params-encoding';

const testEncoding = suite('url-params-encoding');
testEncoding('paths', () => {
  equal(encodeParamsToUrl('/path'), '/path');
  equal(encodeParamsToUrl('/hello/[slug]', { slug: 'world' }), '/hello/world');
  equal(
    encodeParamsToUrl('/hello/[slug]/', { slug: 'world/universe' }),
    '/hello/world%2Funiverse/'
  );
  equal(encodeParamsToUrl('/hello/[...rest]', { rest: 'world/universe' }), '/hello/world/universe');
});

testEncoding('search', () => {
  equal(
    encodeParamsToUrl('/path', {
      text: '@text',
      number: -12.3e45,
      nan: Number.NaN,
      true: true,
      false: false,
      null: null,
      undefined: undefined,
    }),
    '/path?false=false&nan=NaN&null=null&number=-1.23e46&text=@text&true=true&undefined=undefined'
  );
  equal(
    encodeParamsToUrl('/path', {
      date: '@123',
      number: '-12.3e45',
      true: String(true),
      false: String(false),
      null: String(null),
      undefined: String(undefined),
    }),
    '/path?date=~@123&false=~false&null=~null&number=~-12.3e45&true=~true&undefined=~undefined'
  );
});

testEncoding('objects', () => {
  equal(
    encodeParamsToUrl('/path', {
      object: { a: 1, b: 2 },
      array: [1, 2, 3],
      date: new Date(123456789),
    }),
    '/path?array=[1&2&3]&date=@123456789&object={a=1&b=2}'
  );
});

testEncoding('example', () => {
  equal(
    encodeParamsToUrl('/contact/[contactId]/', {
      contactId: 123,
      dob: new Date(Date.parse('1980-01-01 GMT')),
      predicate: { name: 'John', age: 42, alias: ['Jon', 'Johnny'] },
    }),
    '/contact/123/?dob=@315532800000&predicate={age=42&alias=[Jon&Johnny]&name=John}'
  );
});

testEncoding.run();

const testDecoding = suite('url-params-decoding');

testDecoding('url', () => {
  equal(decodeParamsFromUrl('/hello/[slug]', '/hello/world'), { slug: 'world' });
  equal(decodeParamsFromUrl('/hello/[...rest]', '/hello/world/universe'), {
    rest: 'world/universe',
  });
});

testDecoding('search', () => {
  equal(
    decodeParamsFromUrl(
      '/path',
      '/path',
      'false=false&nan=NaN&null=null&number=-1.23e46&text=@text&true=true&undefined=undefined'
    ),
    {
      false: false,
      nan: Number.NaN,
      null: null,
      number: -12.3e45,
      text: '@text',
      true: true,
      undefined: undefined,
    }
  );
  equal(decodeParamsFromUrl('/path', '/path', 'array=[1&2&3]'), {
    array: [1, 2, 3],
  });
  equal(decodeParamsFromUrl('/path', '/path', 'object={a=1&b=2}'), {
    object: { a: 1, b: 2 },
  });
  equal(decodeParamsFromUrl('/path', '/path', 'date=@123'), {
    date: new Date(123),
  });
});

testDecoding('mixed', () => {
  assert({ a: 1 });
  assert({ a: 1, b: '2' });
  assert({ a: true, b: 1.2e4, date: new Date() });
  assert({ b: [true] });
  assert({ b: { c: 'test' } });
});
testDecoding('chained', () => {
  assert({ a: [true], b: 1 });
  assert({ a: [true, { '@123': 'date' }], b: 1 });
});

testDecoding('escape', () => {
  assert({ a: '[a] / ? { + } = &', b: 1 });
});

function assert(value: any) {
  const path = '/path/';
  const search = encodeParamsToUrl(path, value).split('/path/?')[1];
  equal(decodeParamsFromUrl(path, path, search), value);
}

testDecoding.run();
