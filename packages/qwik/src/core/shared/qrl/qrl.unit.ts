import { $ } from '@qwik.dev/core';
import { createQRL } from './qrl-class';
import { _regSymbol, inlinedQrl, qrl } from './qrl';
import { describe, test, assert, assertType, expectTypeOf } from 'vitest';
import { type QRL } from './qrl.public';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { createSerializationContext, parseQRL, qrlToString } from '../serdes/index';

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
      $capture$: null,
    });
    matchProps(parseQRL('./chunk#s1[1 2]'), {
      $chunk$: './chunk',
      $symbol$: 's1',
      $capture$: [1, 2],
    });
    matchProps(parseQRL('./chunk#s1[1 2]'), {
      $chunk$: './chunk',
      $symbol$: 's1',
      $capture$: [1, 2],
    });
    matchProps(parseQRL('./chunk#s1[1 2]'), {
      $chunk$: './chunk',
      $symbol$: 's1',
      $capture$: [1, 2],
    });
    matchProps(parseQRL('./chunk[1 2]'), {
      $chunk$: './chunk',
      $capture$: [1, 2],
    });
    matchProps(parseQRL('./path#symbol[2]'), {
      $chunk$: './path',
      $symbol$: 'symbol',
      $capture$: [2],
    });
    matchProps(
      parseQRL(
        '/src/path%2d/foo_symbol.js?_qrl_parent=/home/user/project/src/path/foo.js#symbol[2]'
      ),
      {
        $chunk$: '/src/path%2d/foo_symbol.js?_qrl_parent=/home/user/project/src/path/foo.js',
        $symbol$: 'symbol',
        $capture$: [2],
      }
    );
  });

  test('serialize qrls', () => {
    const serializationContext = createSerializationContext(
      null,
      null,
      () => '',
      () => '',
      () => {},
      new WeakMap<any, any>()
    );
    assert.equal(
      qrlToString(serializationContext, createQRL('./chunk', '', null, null, null, null)),
      'chunk#'
    );
    assert.equal(
      qrlToString(serializationContext, createQRL('./c', 's1', null, null, null, null)),
      'c#s1'
    );
    assert.equal(
      qrlToString(serializationContext, createQRL('./c', 's1', null, null, [], null)),
      'c#s1'
    );
    assert.equal(
      qrlToString(serializationContext, createQRL('./c', 's1', null, null, [1, '2'] as any, null)),
      'c#s1[1 2]'
    );
    assert.equal(
      qrlToString(serializationContext, createQRL('c', 's1', null, null, [1 as any, '2'], null)),
      'c#s1[1 2]'
    );
    assert.equal(
      qrlToString(
        serializationContext,
        createQRL('src/routes/[...index]/a+b/c?foo', 's1', null, null, [1 as any, '2'], null)
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
  test.todo('should parse self-reference');

  test('should store resolved value', async () => {
    const q = qrl(() => Promise.resolve({ hi: 'hello' }), 'hi');
    assert.equal(q.resolved, undefined);
    await q.resolve();
    assert.equal(q.resolved, 'hello');
  });
});

describe('createQRL', () => {
  test('should create QRL', () => {
    const q = createQRL('chunk', 'symbol', 'resolved', null, null, null);
    matchProps(q, {
      $chunk$: 'chunk',
      $symbol$: 'symbol',
      resolved: 'resolved',
    });
  });
  test('should have .resolved: given scalar', async () => {
    const q = createQRL('chunk', 'symbol', 'resolved', null, null, null);
    assert.equal(q.resolved, 'resolved');
  });
  test('should have .resolved: given promise for scalar', async () => {
    const q = createQRL('chunk', 'symbol', Promise.resolve('resolved'), null, null, null);
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
      null
    );
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), 'resolved');
    assert.equal(q.resolved, 'resolved');
  });

  const fn = () => 'hi';
  test('should have .resolved: given function without captures', async () => {
    const q = createQRL('chunk', 'symbol', fn, null, null, null);
    assert.equal(q.resolved, fn);
  });
  test('should have .resolved: given promise for function without captures', async () => {
    const q = createQRL('chunk', 'symbol', Promise.resolve(fn), null, null, null);
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), fn);
    assert.equal(q.resolved, fn);
  });
  test('should have .resolved: promise for function without captures', async () => {
    const q = createQRL('chunk', 'symbol', null, () => Promise.resolve({ symbol: fn }), null, null);
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), fn);
    assert.equal(q.resolved, fn);
  });

  const capFn = () => useLexicalScope();
  test('should have .resolved: given function with captures', async () => {
    const q = createQRL('chunk', 'symbol', capFn, null, null, ['hi']);
    assert.isDefined(q.resolved);
    assert.notEqual(q.resolved, capFn);
    assert.deepEqual(q.resolved!(), ['hi']);
  });
  test('should have .resolved: given promise for function with captures', async () => {
    const q = createQRL('chunk', 'symbol', Promise.resolve(capFn), null, null, ['hi']);
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
      ['hi']
    );
    assert.equal(q.resolved, undefined);
    assert.deepEqual(await q(), ['hi']);
    assert.notEqual(q.resolved, capFn);
    assert.deepEqual(q.resolved!(), ['hi']);
  });
});

describe('inlinedQrl', () => {
  test('should recover symbol from registry', async () => {
    const symbol = () => 'hello';
    // The optimizer normally injects the _regSymbol call here
    inlinedQrl(_regSymbol(symbol, '123'), 'mySymbol_123');
    const otherQrl = inlinedQrl(null, 'mySymbol_123');
    await otherQrl.resolve();
    assert.equal(otherQrl.resolved, symbol);
  });
});

describe('binding this', () => {
  test('should bind this', async () => {
    const myQrlFn = $(function (this: any, value: string) {
      return this.prefix + value;
    });
    const boundQrl = myQrlFn.bind({ prefix: 'Hello ' });
    const result = await boundQrl('World!');
    assert.equal(result, 'Hello World!');
  });

  test('should bind this even when not yet resolved', async () => {
    const myQrlFn = qrl(
      () =>
        Promise.resolve().then(() => ({
          world123(this: any, value: string) {
            return this.prefix + value;
          },
        })),
      'world123'
    );
    const boundQrl = myQrlFn.bind({ prefix: 'Hello ' });
    const result = await boundQrl('World!');
    assert.equal(result, 'Hello World!');
  });
});
