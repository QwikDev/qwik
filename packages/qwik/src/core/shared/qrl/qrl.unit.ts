import { $ } from '@qwik.dev/core';
import { assert, assertType, describe, expectTypeOf, test, vi } from 'vitest';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { getPlatform, setPlatform } from '../platform/platform';
import { createSerializationContext, parseQRL, qrlToString } from '../serdes/index';
import { _regSymbol, inlinedQrl, qrl } from './qrl';
import { _captures, createQRL, deserializeCaptureDeltas } from './qrl-class';
import { type QRL } from './qrl.public';

function matchProps(obj: any, properties: Record<string, any>) {
  for (const [key, value] of Object.entries(properties)) {
    assert.deepEqual(obj[key], value, `${obj[key]} !== ${value}`);
  }
}

function matchDeltaCaptures(obj: any, qrlString: string) {
  assert.deepEqual(obj.$captures$, qrlString);
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
      $captures$: undefined,
    });
    matchProps(parseQRL('./chunk#s1#1 2'), {
      $chunk$: './chunk',
      $symbol$: 's1',
    });
    matchDeltaCaptures(parseQRL('./chunk#s1#1 2'), '1 2');
    matchProps(parseQRL('./chunk##1 2'), {
      $chunk$: './chunk',
    });
    matchDeltaCaptures(parseQRL('./chunk##1 2'), '1 2');
    matchProps(parseQRL('./path#symbol#2'), {
      $chunk$: './path',
      $symbol$: 'symbol',
    });
    matchDeltaCaptures(parseQRL('./path#symbol#2'), '2');
    matchProps(
      parseQRL(
        '/src/path%2d/foo_symbol.js?_qrl_parent=/home/user/project/src/path/foo.js#symbol#2'
      ),
      {
        $chunk$: '/src/path%2d/foo_symbol.js?_qrl_parent=/home/user/project/src/path/foo.js',
        $symbol$: 'symbol',
      }
    );
    matchDeltaCaptures(
      parseQRL(
        '/src/path%2d/foo_symbol.js?_qrl_parent=/home/user/project/src/path/foo.js#symbol#2'
      ),
      '2'
    );
  });

  test('serialize qrls', () => {
    const serializationContext = createSerializationContext(
      null,
      null,
      () => '',
      () => {},
      new WeakMap<any, any>()
    );
    assert.equal(
      qrlToString(serializationContext, createQRL('./chunk', '', null, null, null)),
      'chunk#'
    );
    assert.equal(
      qrlToString(serializationContext, createQRL('./c', 's1', null, null, null)),
      'c#s1'
    );
    assert.equal(qrlToString(serializationContext, createQRL('./c', 's1', null, null, [])), 'c#s1');
    assert.equal(
      qrlToString(serializationContext, createQRL('./c', 's1', null, null, [{}, {}])),
      'c#s1#0 1'
    );
    assert.equal(
      qrlToString(
        serializationContext,
        createQRL('src/routes/[...index]/a+b/c?foo', 's1', null, null, [{}, {}])
      ),
      'src/routes/[...index]/a+b/c?foo#s1#2 1'
    );
  });

  test('deserialize delta capture strings', () => {
    const roots = ['first', 'second', 'third'];
    const container = {
      $getObjectById$: (id: number) => roots[id],
    } as any;

    assert.deepEqual(deserializeCaptureDeltas(container, '1 1'), ['second', 'third']);
  });

  test('should store resolved value', async () => {
    const q = qrl(() => Promise.resolve({ hi: 'hello' }), 'hi');
    assert.equal(q.resolved, undefined);
    await q.resolve();
    assert.equal(q.resolved, 'hello');
  });
});

describe('createQRL', () => {
  test('should create QRL', () => {
    const q = createQRL('chunk', 'symbol', 'resolved', null, null);
    matchProps(q, {
      $chunk$: 'chunk',
      $symbol$: 'symbol',
      resolved: 'resolved',
    });
  });
  test('should have .resolved: given scalar', async () => {
    const q = createQRL('chunk', 'symbol', 'resolved', null, null);
    assert.equal(q.resolved, 'resolved');
  });
  test('should have .resolved: given promise for scalar', async () => {
    const q = createQRL('chunk', 'symbol', Promise.resolve('resolved'), null, null);
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
      null
    );
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), 'resolved');
    assert.equal(q.resolved, 'resolved');
  });

  test('should log a failed chunk only once per container', async () => {
    const firstError = new Error('first failure');
    const secondError = new Error('second failure');
    const thirdError = new Error('third failure');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const previousPlatform = getPlatform();
    const importSymbol = vi
      .fn()
      .mockRejectedValueOnce(firstError)
      .mockRejectedValueOnce(secondError)
      .mockRejectedValueOnce(thirdError);
    setPlatform({ ...previousPlatform, isServer: false, importSymbol });

    try {
      const firstContainer = { element: {} } as any;
      const secondContainer = { element: {} } as any;
      const firstQrl = createQRL('chunk', 'first', null, null, null, firstContainer);
      const secondQrl = createQRL('chunk', 'second', null, null, null, firstContainer);
      const thirdQrl = createQRL('chunk', 'third', null, null, null, secondContainer);

      const results = await Promise.allSettled([
        firstQrl.resolve(),
        secondQrl.resolve(),
        thirdQrl.resolve(),
      ]);

      assert.deepEqual(results, [
        { status: 'rejected', reason: firstError },
        { status: 'rejected', reason: secondError },
        { status: 'rejected', reason: thirdError },
      ]);
      assert.equal(consoleError.mock.calls.length, 2);
      assert.deepEqual(consoleError.mock.calls[0], ['qrl first failed to load', firstError]);
      assert.deepEqual(consoleError.mock.calls[1], ['qrl third failed to load', thirdError]);
    } finally {
      setPlatform(previousPlatform);
      consoleError.mockRestore();
    }
  });

  test('should not deduplicate failed chunks on the server', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const previousPlatform = getPlatform();
    const importSymbol = vi.fn().mockRejectedValue(new Error('failure'));
    setPlatform({ ...previousPlatform, isServer: true, importSymbol });

    try {
      const container = { element: {} } as any;
      const firstQrl = createQRL('server-chunk', 'first', null, null, null, container);
      const secondQrl = createQRL('server-chunk', 'second', null, null, null, container);

      await Promise.allSettled([firstQrl.resolve(), secondQrl.resolve()]);

      assert.equal(consoleError.mock.calls.length, 2);
    } finally {
      setPlatform(previousPlatform);
      consoleError.mockRestore();
    }
  });

  const fn = () => 'hi';
  test('should have .resolved: given function without captures', async () => {
    const q = createQRL('chunk', 'symbol', fn, null, null);
    assert.equal(q.resolved, fn);
  });
  test('should have .resolved: given promise for function without captures', async () => {
    const q = createQRL('chunk', 'symbol', Promise.resolve(fn), null, null);
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), fn);
    assert.equal(q.resolved, fn);
  });
  test('should have .resolved: promise for function without captures', async () => {
    const q = createQRL('chunk', 'symbol', null, () => Promise.resolve({ symbol: fn }), null);
    assert.equal(q.resolved, undefined);
    assert.equal(await q.resolve(), fn);
    assert.equal(q.resolved, fn);
  });

  const capFn = () => useLexicalScope();
  test('should have .resolved: given function with captures', async () => {
    const q = createQRL('chunk', 'symbol', capFn, null, ['hi']);
    assert.isDefined(q.resolved);
    assert.notEqual(q.resolved, capFn);
    assert.deepEqual(q.resolved!(), ['hi']);
  });
  test('should have .resolved: given promise for function with captures', async () => {
    const q = createQRL('chunk', 'symbol', Promise.resolve(capFn), null, ['hi']);
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

describe('w (with captures)', () => {
  const capFn = () => _captures;

  test('should share the same LazyRef', () => {
    const q1 = createQRL('chunk', 'symbol', capFn, null, ['a']);
    const q2 = q1.w(['b']);
    assert.strictEqual(q1.$lazy$, q2.$lazy$);
  });

  test('should create a new QRL with different captures', () => {
    const q1 = createQRL('chunk', 'symbol', capFn, null, ['a']);
    const q2 = q1.w(['b', 'c']);
    assert.deepEqual(q1.resolved!(), ['a']);
    assert.deepEqual(q2.resolved!(), ['b', 'c']);
  });

  test('should not affect the original QRL', () => {
    const q1 = createQRL('chunk', 'symbol', capFn, null, ['original']);
    q1.w(['changed']);
    assert.deepEqual(q1.resolved!(), ['original']);
  });

  test('should preserve chunk and symbol', () => {
    const q1 = createQRL('chunk', 'symbol', capFn, null, ['a']);
    const q2 = q1.w(['b']);
    assert.equal(q2.$chunk$, 'chunk');
    assert.equal(q2.$symbol$, 'symbol');
    assert.equal(q2.$hash$, q1.$hash$);
  });

  test('should resolve independently with its own captures', async () => {
    const q1 = createQRL<Function>(
      'chunk',
      'symbol',
      null,
      () => Promise.resolve({ symbol: capFn }),
      ['first']
    );
    const q2 = q1.w(['second']);

    assert.equal(q1.resolved, undefined);
    assert.equal(q2.resolved, undefined);

    assert.deepEqual(await q1(), ['first']);
    assert.deepEqual(await q2(), ['second']);
  });

  test('should work with no captures', () => {
    const fn = () => 'hi';
    const q1 = createQRL('chunk', 'symbol', fn, null, ['a']);
    const q2 = q1.w(null);
    assert.equal(q2.resolved, fn);
  });

  test('should be callable', async () => {
    const q1 = createQRL('chunk', 'symbol', capFn, null, ['a']);
    const q2 = q1.w(['hello', 'world']);
    assert.deepEqual(await q2(), ['hello', 'world']);
  });

  test('should resolve immediately when LazyRef already loaded', async () => {
    const q1 = createQRL('chunk', 'symbol', capFn, null, ['a']);
    // q1 is resolved synchronously because capFn is provided directly
    assert.isDefined(q1.resolved);
    // LazyRef.$ref$ is populated, so w should resolve sync too
    const q2 = q1.w(['b']);
    assert.isDefined(q2.resolved);
    assert.deepEqual(q2.resolved!(), ['b']);
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
