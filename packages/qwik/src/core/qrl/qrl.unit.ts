import { parseQRL, serializeQRL } from './qrl';
import { createQRL } from './qrl-class';
import { qrl } from './qrl';
import { describe, test, assert, assertType, expectTypeOf } from 'vitest';
import { $, type QRL } from './qrl.public';
import { useLexicalScope } from '../use/use-lexical-scope.public';

function matchProps(obj: any, properties: Record<string, any>) {
  for (const [key, value] of Object.entries(properties)) {
    assert.deepEqual(obj[key], value, `${obj[key]} !== ${value}`);
  }
}

describe('types', () => {
  // double function because we test at typecheck time
  test('matching', () => () => {
    const fakeStr = true as any as QRL<'hello'>;
    expectTypeOf(fakeStr).not.toBeAny();
    assertType<() => Promise<string>>(fakeStr.resolve);
    const fooFn = (hi: boolean) => 'foo';
    const fakeFn = true as any as QRL<typeof fooFn>;
    expectTypeOf(fakeFn).not.toBeAny();
    assertType<(hi: boolean) => Promise<string>>(fakeFn);
  });
  test('inferring', () => () => {
    const myWrapper = (fn: QRL<(hi: boolean) => string>) => fn(true);
    const result = myWrapper(
      $((hi) => {
        expectTypeOf(hi).toEqualTypeOf<boolean>();
        return 'hello';
      })
    );
    expectTypeOf(result).toEqualTypeOf<Promise<string>>();
    const myPropsWrapper = (props: { fn: QRL<(hi: boolean) => string> }) => props.fn(true);
    const propsResult = myPropsWrapper({
      fn: $((hi) => {
        expectTypeOf(hi).toEqualTypeOf<boolean>();
        return 'hello';
      }),
    });
    expectTypeOf(propsResult).toEqualTypeOf<Promise<string>>();
  });
});

describe('serialization', () => {
  test('should parse', () => {
    matchProps(parseQRL('./chunk#default'), {
      $chunk$: './chunk',
      $symbol$: 'default',
      resolved: undefined,
    });
    matchProps(parseQRL('./chunk#mySymbol'), {
      $chunk$: './chunk',
      $symbol$: 'mySymbol',
    });
    matchProps(parseQRL('./chunk#mySymbol'), {
      $chunk$: './chunk',
      $symbol$: 'mySymbol',
    });
    matchProps(parseQRL('./chunk#s1'), {
      $chunk$: './chunk',
      $symbol$: 's1',
      $capture$: [],
    });
    matchProps(parseQRL('./chunk#s1[1 b]'), {
      $chunk$: './chunk',
      $symbol$: 's1',
      $capture$: ['1', 'b'],
    });
    matchProps(parseQRL('./chunk#s1[1 b]'), {
      $chunk$: './chunk',
      $symbol$: 's1',
      $capture$: ['1', 'b'],
    });
    matchProps(parseQRL('./chunk#s1[1 b]'), {
      $chunk$: './chunk',
      $symbol$: 's1',
      $capture$: ['1', 'b'],
    });
    matchProps(parseQRL('./chunk[1 b]'), {
      $chunk$: './chunk',
      $capture$: ['1', 'b'],
    });
    matchProps(parseQRL('./path#symbol[2]'), {
      $chunk$: './path',
      $symbol$: 'symbol',
      $capture$: ['2'],
    });
    matchProps(
      parseQRL(
        '/src/path%2d/foo_symbol.js?_qrl_parent=/home/user/project/src/path/foo.js#symbol[2]'
      ),
      {
        $chunk$: '/src/path%2d/foo_symbol.js?_qrl_parent=/home/user/project/src/path/foo.js',
        $symbol$: 'symbol',
        $capture$: ['2'],
      }
    );
  });

  test('serialize qrls', () => {
    assert.equal(serializeQRL(createQRL('./chunk', '', null, null, null, null, null)), 'chunk#');
    assert.equal(serializeQRL(createQRL('./c', 's1', null, null, null, null, null)), 'c#s1');
    assert.equal(serializeQRL(createQRL('./c', 's1', null, null, [], null, null)), 'c#s1');
    assert.equal(
      serializeQRL(createQRL('./c', 's1', null, null, [1, '2'] as any, null, null)),
      'c#s1[1 2]'
    );
    assert.equal(
      serializeQRL(createQRL('c', 's1', null, null, [1 as any, '2'], null, null)),
      'c#s1[1 2]'
    );
    assert.equal(
      serializeQRL(
        createQRL('src/routes/[...index]/a+b/c?foo', 's1', null, null, [1 as any, '2'], null, null)
      ),
      'src/routes/[...index]/a+b/c?foo#s1[1 2]'
    );
  });

  test('should parse reference', () => {
    const require = (str: string) => {
      console.warn(str);
    };
    matchProps(
      qrl(
        () =>
          Promise.resolve().then(function () {
            return require('./h_my-app_myapp_init-73253fd4.js');
          }),
        'MyApp_init'
      ),
      {
        $chunk$: './h_my-app_myapp_init-73253fd4.js',
        $symbol$: 'MyApp_init',
      }
    );
  });

  // See https://github.com/QwikDev/qwik/issues/5087#issuecomment-1707185010
  test.skip('should parse self-reference', () => {});

  test('should store resolved value', async () => {
    const q = qrl(() => Promise.resolve({ hi: 'hello' }), 'hi');
    assert.equal(q.resolved, undefined);
    await q.resolve();
    assert.equal(q.resolved, 'hello');
  });
});

describe('createQRL', () => {
  test('should create QRL', () => {
    const q = createQRL('chunk', 'symbol', 'resolved', null, null, null, null);
    matchProps(q, {
      $chunk$: 'chunk',
      $symbol$: 'symbol',
      resolved: 'resolved',
    });
  });
  test('should have .resolved: given scalar', async () => {
    const q = createQRL('chunk', 'symbol', 'resolved', null, null, null, null);
    assert.equal(q.resolved, 'resolved');
  });
  test('should have .resolved: given promise for scalar', async () => {
    const q = createQRL('chunk', 'symbol', Promise.resolve('resolved'), null, null, null, null);
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), 'resolved');
    assert.equal(q.resolved, 'resolved');
  });
  test('should have .resolved: promise for scalar', async () => {
    const q = createQRL(
      'chunk',
      'symbol',
      null,
      () => Promise.resolve({ symbol: 'resolved' }),
      null,
      null,
      null
    );
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), 'resolved');
    assert.equal(q.resolved, 'resolved');
  });

  const fn = () => 'hi';
  test('should have .resolved: given function without captures', async () => {
    const q = createQRL('chunk', 'symbol', fn, null, null, null, null);
    assert.equal(q.resolved, fn);
  });
  test('should have .resolved: given promise for function without captures', async () => {
    const q = createQRL('chunk', 'symbol', Promise.resolve(fn), null, null, null, null);
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), fn);
    assert.equal(q.resolved, fn);
  });
  test('should have .resolved: promise for function without captures', async () => {
    const q = createQRL(
      'chunk',
      'symbol',
      null,
      () => Promise.resolve({ symbol: fn }),
      null,
      null,
      null
    );
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), fn);
    assert.equal(q.resolved, fn);
  });

  const capFn = () => useLexicalScope();
  test('should have .resolved: given function with captures', async () => {
    const q = createQRL('chunk', 'symbol', capFn, null, null, ['hi'], null);
    assert.isDefined(q.resolved);
    assert.notEqual(q.resolved, capFn);
    assert.deepEqual(q.resolved!(), ['hi']);
  });
  test('should have .resolved: given promise for function with captures', async () => {
    const q = createQRL('chunk', 'symbol', Promise.resolve(capFn), null, null, ['hi'], null);
    assert.equal(q.resolved, undefined);
    assert.deepEqual(await q(), ['hi']);
    assert.notEqual(q.resolved, capFn);
    assert.deepEqual(q.resolved!(), ['hi']);
  });
  test('should have .resolved: promise for function with captures', async () => {
    const q = createQRL<Function>(
      'chunk',
      'symbol',
      null,
      () => Promise.resolve({ symbol: capFn }),
      null,
      ['hi'],
      null
    );
    assert.equal(q.resolved, undefined);
    assert.deepEqual(await q(), ['hi']);
    assert.notEqual(q.resolved, capFn);
    assert.deepEqual(q.resolved!(), ['hi']);
  });
});
