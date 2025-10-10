import { $, componentQrl, noSerialize } from '@qwik.dev/core';
import { describe, expect, it, vi } from 'vitest';
import { _createDeserializeContainer } from './serdes.public';
import { _dumpState } from './dump-state';
import { createSerializationContext } from './serialization-context';
import { _typeIdNames } from './constants';
import { TypeIds } from './constants';
import { _fnSignal, _wrapProp } from '../../internal';
import { type SignalImpl } from '../../reactive-primitives/impl/signal-impl';
import { createStore } from '../../reactive-primitives/impl/store';
import { createAsyncComputedSignal } from '../../reactive-primitives/signal-api';
import {
  createComputedQrl,
  createSerializerQrl,
  createSignal,
  isSignal,
} from '../../reactive-primitives/signal.public';
import { SubscriptionData } from '../../reactive-primitives/subscription-data';
import { StoreFlags } from '../../reactive-primitives/types';
import { createResourceReturn } from '../../use/use-resource';
import { Task } from '../../use/use-task';
import { QError } from '../error/error';
import { inlinedQrl } from '../qrl/qrl';
import { createQRL, type QRLInternal } from '../qrl/qrl-class';
import { isQrl } from '../qrl/qrl-utils';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../utils/flyweight';
import { retryOnPromise } from '../utils/promises';
import { NoSerializeSymbol, SerializerSymbol } from '../utils/serialize-utils';
import { _constants } from './constants';
import { _serializationWeakRef } from './serialize';

const DEBUG = false;

const title = (typeId: TypeIds) => `${typeId} ${_typeIdNames[typeId]}`;

// Keep the tests in typeId order so it's easy to see if we missed one
describe('shared-serialization', () => {
  const shared1 = { shared: 1 };
  const shared2 = { shared: 2 };

  describe('serialize types', () => {
    const dump = async (...value: any) => _dumpState(await serialize(...value));
    it(title(TypeIds.Plain), async () => {
      expect(await dump('hi', 123.456)).toMatchInlineSnapshot(`
        "
        0 {string} "hi"
        1 {number} 123.456
        (18 chars)"
      `);
      // make sure we're not serializing the same string twice
      expect(await dump(['long'], 'long')).toMatchInlineSnapshot(`
        "
        0 Array [
          RootRef 1
        ]
        1 {string} "long"
        (18 chars)"
      `);
    });
    it(title(TypeIds.RootRef), async () => {
      expect(await dump([shared1, shared1])).toMatchInlineSnapshot(`
        "
        0 Array [
          Object [
            {string} "shared"
            {number} 1
          ]
          RootRef 1
        ]
        1 RootRef "0 0"
        (36 chars)"
      `);
    });
    it(title(TypeIds.Constant), async () => {
      expect(await dump(..._constants)).toMatchInlineSnapshot(`
        "
        0 Constant undefined
        1 Constant null
        2 Constant true
        3 Constant false
        4 Constant ''
        5 Constant EMPTY_ARRAY
        6 Constant EMPTY_OBJ
        7 Constant NEEDS_COMPUTATION
        8 Constant STORE_ALL_PROPS
        9 Constant _UNINITIALIZED
        10 Constant Slot
        11 Constant Fragment
        12 Constant NaN
        13 Constant Infinity
        14 Constant -Infinity
        15 Constant MAX_SAFE_INTEGER
        16 Constant MAX_SAFE_INTEGER-1
        17 Constant MIN_SAFE_INTEGER
        (81 chars)"
      `);
    });
    it(title(TypeIds.Array), async () => {
      expect(await dump([0, null, 'hello'])).toMatchInlineSnapshot(`
        "
        0 Array [
          {number} 0
          Constant null
          {string} "hello"
        ]
        (23 chars)"
      `);
    });
    it(title(TypeIds.Object), async () => {
      const objs = await serialize({ foo: shared1 }, { bar: shared1, shared: true });
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "foo"
          Object [
            {string} "shared"
            {number} 1
          ]
        ]
        1 Object [
          {string} "bar"
          RootRef 2
          RootRef 3
          Constant true
        ]
        2 RootRef "0 1"
        3 RootRef "0 1 0"
        (74 chars)"
      `);
      expect(objs).toHaveLength(8);
    });
    it(title(TypeIds.URL), async () => {
      expect(await dump(new URL('http://example.com:80/'))).toMatchInlineSnapshot(`
        "
        0 URL "http://example.com/"
        (25 chars)"
      `);
    });
    it(title(TypeIds.Date), async () => {
      expect(await dump(new Date('2020-01-02T12:34Z'))).toMatchInlineSnapshot(`
        "
        0 Date 1577968440000
        (17 chars)"
      `);
      expect(await dump(new Date('invalid'))).toMatchInlineSnapshot(`
        "
        0 Date ""
        (6 chars)"
      `);
    });
    it(title(TypeIds.Regex), async () => {
      expect(await dump(/abc/gm)).toMatchInlineSnapshot(`
        "
        0 Regex "/abc/gm"
        (13 chars)"
      `);
    });
    it.todo(title(TypeIds.VNode));
    it(title(TypeIds.BigInt), async () => {
      expect(await dump(BigInt('12345678901234567890'))).toMatchInlineSnapshot(
        `
        "
        0 BigInt "12345678901234567890"
        (27 chars)"
      `
      );
    });
    it(title(TypeIds.URLSearchParams), async () => {
      expect(await dump(new URLSearchParams({ a: '', b: '12' }))).toMatchInlineSnapshot(
        `
        "
        0 URLSearchParams "a=&b=12"
        (14 chars)"
      `
      );
    });
    it(title(TypeIds.Error), async () => {
      const err = new Error('hi');
      err.stack = err
        .stack!.replaceAll(/([A-Z]:){0,1}(\/|\\).*\./g, '/...path/file.')
        .replaceAll(/:\d+:\d+/g, ':123:456');
      const dumpNoSize = async (obj: any) =>
        (await dump(obj)).replaceAll(/\(\d+ chars\)/g, '(x chars)');
      expect(await dumpNoSize(err)).toMatchInlineSnapshot(`
        "
        0 Error [
          {string} "hi"
          {string} "stack"
          {string} "Error: hi\\n    at /...path/file.ts:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\n    at new Promise (<anonymous>)\\n    at runWithTimeout (file:/...path/file.js:123:456)\\n    at runTest (file:/...path/file.js:123:456)\\n    at processTicksAndRejections (node:internal/process/task_queues:123:456)\\n    at runSuite (file:/...path/file.js:123:456)\\n    at runSuite (file:/...path/file.js:123:456)"
        ]
        (x chars)"
      `);
      (err as any).extra = 'yey';
      expect(await dumpNoSize(err)).toMatchInlineSnapshot(`
        "
        0 Error [
          {string} "hi"
          {string} "extra"
          {string} "yey"
          {string} "stack"
          {string} "Error: hi\\n    at /...path/file.ts:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\n    at new Promise (<anonymous>)\\n    at runWithTimeout (file:/...path/file.js:123:456)\\n    at runTest (file:/...path/file.js:123:456)\\n    at processTicksAndRejections (node:internal/process/task_queues:123:456)\\n    at runSuite (file:/...path/file.js:123:456)\\n    at runSuite (file:/...path/file.js:123:456)"
        ]
        (x chars)"
      `);
    });
    it(title(TypeIds.Promise), async () => {
      expect(await dump(Promise.resolve(shared1), Promise.reject(shared2))).toMatchInlineSnapshot(`
        "
        0 ForwardRef 0
        1 ForwardRef 1
        2 Promise [
          Constant true
          Object [
            {string} "shared"
            {number} 1
          ]
        ]
        3 Promise [
          Constant false
          Object [
            RootRef 4
            {number} 2
          ]
        ]
        4 RootRef "2 1 0"
        5 ForwardRefs [
          2
          3
        ]
        (77 chars)"
      `);
    });
    it(title(TypeIds.Promise) + ' async', async () => {
      expect(
        await dump(
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(shared1);
            }, 200);
          }),
          Promise.resolve({ foo: 'bar' })
        )
      ).toMatchInlineSnapshot(`
        "
        0 ForwardRef 0
        1 ForwardRef 1
        2 Promise [
          Constant true
          Object [
            {string} "foo"
            {string} "bar"
          ]
        ]
        3 Promise [
          Constant true
          Object [
            {string} "shared"
            {number} 1
          ]
        ]
        4 ForwardRefs [
          3
          2
        ]
        (75 chars)"
      `);
    });
    it(title(TypeIds.Set), async () => {
      expect(await dump(new Set([shared1, [shared1]]))).toMatchInlineSnapshot(`
        "
        0 Set [
          Object [
            {string} "shared"
            {number} 1
          ]
          Array [
            RootRef 1
          ]
        ]
        1 RootRef "0 0"
        (41 chars)"
      `);
    });
    it(title(TypeIds.Map), async () => {
      expect(
        await dump(
          new Map<any, any>([
            ['shared', shared1],
            [shared2, shared1],
          ])
        )
      ).toMatchInlineSnapshot(`
        "
        0 Map [
          {string} "shared"
          Object [
            RootRef 1
            {number} 1
          ]
          Object [
            RootRef 1
            {number} 2
          ]
          RootRef 2
        ]
        1 RootRef "0 0"
        2 RootRef "0 1"
        (61 chars)"
      `);
    });
    it(title(TypeIds.Uint8Array), async () => {
      expect(await dump(new Uint8Array([0, 20, 128, 255]))).toMatchInlineSnapshot(
        `
        "
        0 Uint8Array "ABSA/w"
        (13 chars)"
      `
      );
    });
    it(title(TypeIds.QRL), async () => {
      const myVar = 123;
      const other = 'hello';
      expect(await dump(inlinedQrl(() => myVar + other, 'dump_qrl', [myVar, other])))
        .toMatchInlineSnapshot(`
          "
          0 QRL "3 4 1 2"
          1 {number} 123
          2 {string} "hello"
          3 {string} "mock-chunk"
          4 {string} "dump_qrl"
          (58 chars)"
        `);
    });
    it(title(TypeIds.Task), async () => {
      expect(
        await dump(
          new Task(
            0,
            0,
            shared1 as any,
            inlinedQrl(() => shared1, 'task_qrl', [shared1]) as QRLInternal,
            shared2 as any,
            null
          )
        )
      ).toMatchInlineSnapshot(`
        "
        0 Task [
          QRL "2 3 1"
          {number} 0
          {number} 0
          RootRef 1
          Constant null
          Object [
            {string} "shared"
            {number} 2
          ]
        ]
        1 Object [
          RootRef 4
          {number} 1
        ]
        2 {string} "mock-chunk"
        3 {string} "task_qrl"
        4 RootRef "0 5 0"
        (102 chars)"
      `);
    });
    it(title(TypeIds.Resource), async () => {
      // Note: we just serialize as a store
      const res = createResourceReturn(null!, undefined, Promise.resolve(123));
      res._state = 'resolved';
      res._resolved = 123;
      expect(await dump(res)).toMatchInlineSnapshot(`
        "
        0 ForwardRef 0
        1 Resource [
          Constant true
          {number} 123
          Constant null
        ]
        2 ForwardRefs [
          1
        ]
        (31 chars)"
      `);
    });
    it(title(TypeIds.Component), async () => {
      expect(
        await dump(componentQrl(inlinedQrl(() => 'hi', 'dump_component')))
      ).toMatchInlineSnapshot(
        `
        "
        0 Component [
          QRL "1 2"
        ]
        1 {string} "mock-chunk"
        2 {string} "dump_component"
        (49 chars)"
      `
      );
    });
    it(title(TypeIds.Signal), async () => {
      const objs = await serialize({ foo: createSignal('hi') });
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "foo"
          Signal [
            {string} "hi"
          ]
        ]
        (25 chars)"
      `);
    });
    it(title(TypeIds.WrappedSignal), async () => {
      const foo = createSignal(3);
      const propSignal = _wrapProp(foo, 'value');
      if (propSignal.value) {
        Math.random();
      }
      const objs = await serialize(
        _fnSignal((p0) => p0 + 1, [3], '(p0)=>p0+1'),
        propSignal
      );
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 WrappedSignal [
          {number} 0
          Array [
            {number} 3
          ]
          Constant null
          {number} 5
          Constant null
        ]
        1 WrappedSignal [
          {number} 1
          Array [
            Signal [
              {number} 3
            ]
            {string} "value"
          ]
          Constant null
          {number} 7
          Constant null
        ]
        (74 chars)"
      `);
    });
    it(title(TypeIds.ComputedSignal), async () => {
      const foo = createSignal(1);
      const dirty = createComputedQrl(inlinedQrl(() => foo.value + 1, 'dirty', [foo]));
      const clean = createComputedQrl(inlinedQrl(() => foo.value + 1, 'clean', [foo]));
      const never = createComputedQrl(
        inlinedQrl(() => foo.value + 1, 'never', [foo]),
        {
          serializationStrategy: 'never',
        }
      );
      const always = createComputedQrl(
        inlinedQrl(() => foo.value + 1, 'always', [foo]),
        {
          serializationStrategy: 'always',
        }
      );
      // note that this won't subscribe because we're not setting up the context
      expect(clean.value).toBe(2);
      expect(never.value).toBe(2);
      expect(always.value).toBe(2);
      const objs = await serialize(dirty, clean, never, always);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 ComputedSignal [
          RootRef 4
          Constant null
        ]
        1 ComputedSignal [
          RootRef 5
          Constant null
          {number} 2
        ]
        2 ComputedSignal [
          RootRef 6
          Constant null
        ]
        3 ComputedSignal [
          RootRef 7
          Constant null
          {number} 2
        ]
        4 PreloadQRL "9 10 8"
        5 PreloadQRL "9 11 8"
        6 PreloadQRL "9 12 8"
        7 PreloadQRL "9 13 8"
        8 Signal [
          {number} 1
        ]
        9 {string} "mock-chunk"
        10 {string} "dirty"
        11 {string} "clean"
        12 {string} "never"
        13 {string} "always"
        (174 chars)"
      `);
    });
    it(title(TypeIds.SerializerSignal), async () => {
      const custom = createSerializerQrl(
        inlinedQrl<{
          serialize: (data: any | undefined) => any;
          deserialize: (data: any) => any;
          initial?: any;
        }>(
          {
            deserialize: (n?: number) => new MyCustomSerializable(n || 3),
            serialize: (obj) => obj.n,
          },
          'custom_createSerializer_qrl'
        )
      );
      // Force the value to be created
      custom.value.inc();
      const objs = await serialize(custom);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 ForwardRef 0
        1 PreloadQRL "3 4"
        2 SerializerSignal [
          RootRef 1
          Constant null
          {number} 4
        ]
        3 {string} "mock-chunk"
        4 {string} "custom_createSerializer_qrl"
        5 ForwardRefs [
          2
        ]
        (85 chars)"
      `);
    });
    it(title(TypeIds.AsyncComputedSignal), async () => {
      const foo = createSignal(1);
      const dirty = createAsyncComputedSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'dirty',
          [foo]
        )
      );
      const clean = createAsyncComputedSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'clean',
          [foo]
        )
      );

      const never = createAsyncComputedSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'never',
          [foo]
        ),
        {
          serializationStrategy: 'never',
        }
      );

      const always = createAsyncComputedSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'always',
          [foo]
        ),
        {
          serializationStrategy: 'always',
        }
      );

      await retryOnPromise(() => {
        // note that this won't subscribe because we're not setting up the context
        expect(clean.value).toBe(2);
        expect(never.value).toBe(2);
        expect(always.value).toBe(2);
      });

      const objs = await serialize(dirty, clean, never, always);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 AsyncComputedSignal [
          RootRef 4
          Constant null
          Constant null
          Constant null
          Constant false
          Constant null
        ]
        1 AsyncComputedSignal [
          RootRef 5
          Constant null
          Constant null
          Constant null
          Constant false
          Constant null
        ]
        2 AsyncComputedSignal [
          RootRef 6
          Constant null
          Constant null
          Constant null
          Constant false
          Constant null
        ]
        3 AsyncComputedSignal [
          RootRef 7
          Constant null
          Constant null
          Constant null
          Constant false
          Constant null
          {number} 2
        ]
        4 PreloadQRL "9 10 8"
        5 PreloadQRL "9 11 8"
        6 PreloadQRL "9 12 8"
        7 PreloadQRL "9 13 8"
        8 Signal [
          {number} 1
        ]
        9 {string} "mock-chunk"
        10 {string} "dirty"
        11 {string} "clean"
        12 {string} "never"
        13 {string} "always"
        (234 chars)"
      `);
    });
    it(title(TypeIds.Store), async () => {
      const orig = { a: { b: true }, orig: undefined as any };
      orig.orig = orig;
      const store = createStore(null, orig, StoreFlags.RECURSIVE);
      (store as any).c = store; // circular ref
      (store.a as any).c = store;
      expect(await dump([orig, store])).toMatchInlineSnapshot(`
        "
        0 Array [
          Object [
            {string} "a"
            Object [
              {string} "b"
              Constant true
              {string} "c"
              Store [
                RootRef 1
                {number} 1
              ]
            ]
            {string} "orig"
            RootRef 1
            {string} "c"
            RootRef 1
          ]
          RootRef 2
        ]
        1 RootRef "0 0"
        2 RootRef "0 0 1 3"
        (95 chars)"
      `);
    });
    it.todo(title(TypeIds.FormData));
    it.todo(title(TypeIds.JSXNode));
    it.todo(title(TypeIds.PropsProxy));
    it(title(TypeIds.SubscriptionData), async () => {
      expect(await dump(new SubscriptionData({ $isConst$: true, $scopedStyleIdPrefix$: null })))
        .toMatchInlineSnapshot(`
        "
        0 SubscriptionData [
          Constant null
          Constant true
        ]
        (14 chars)"
      `);
    });
  });

  const deserialize = (data: unknown[]) => {
    const container = _createDeserializeContainer(data);
    return container.$state$!;
  };

  describe('deserialize types', () => {
    it(title(TypeIds.Plain), async () => {
      const objs = await serialize('', 'hi', ['hi', 123.456]);
      const arr = deserialize(objs);
      expect(arr).toEqual(['', 'hi', ['hi', 123.456]]);
    });
    it(title(TypeIds.RootRef) + ' - shallow refs', async () => {
      const objs = await serialize(shared1, { hi: shared1 });
      const arr = deserialize(objs);
      expect(arr[0]).toBe((arr[1] as any).hi);
    });
    it(title(TypeIds.RootRef) + ' - deep refs', async () => {
      const objs = await serialize({ foo: shared1 }, { bar: shared1 });
      const arr = deserialize(objs);
      expect((arr[0] as any).foo).toBe((arr[1] as any).bar);
    });
    it(title(TypeIds.RootRef) + ' - deep refs case 2', async () => {
      const sharedObj = {
        bar: {
          foo: 'test',
        },
      };
      const obj = {
        test: sharedObj.bar,
        foo: 'abcd',
      };
      const objs = await serialize(sharedObj, obj);
      const arr = deserialize(objs);
      expect((arr[0] as any).bar).toBe((arr[1] as any).test);
    });
    it(title(TypeIds.Constant), async () => {
      const objs = await serialize(..._constants);
      const arr = deserialize(objs);
      expect(arr).toEqual(_constants);
    });
    it(title(TypeIds.Array), async () => {
      const objs = await serialize([0, null, 'hello']);
      const arr = deserialize(objs);
      expect(arr[0]).toEqual([0, null, 'hello']);
    });
    it(title(TypeIds.Object), async () => {
      const objs = await serialize(
        { foo: shared1 },
        { bar: shared1, shared: true },
        shared1,
        {},
        {}
      );
      const arr = deserialize(objs);
      expect(arr[0]).toHaveProperty('foo', shared1);
      expect(arr[1]).toHaveProperty('bar', shared1);
      expect(arr[1]).toHaveProperty('shared', true);
      const obj = arr[2];
      expect((arr[0] as any).foo).toBe(obj);
      expect(arr[3]).toEqual(arr[4]);
      expect(arr[3]).not.toBe(arr[4]);
    });
    it(title(TypeIds.URL), async () => {
      const objs = await serialize(new URL('http://example.com:80/'));
      const url = deserialize(objs)[0] as URL;
      expect(url).toBeInstanceOf(URL);
      expect(url.toString()).toBe('http://example.com/');
    });
    it(title(TypeIds.Date), async () => {
      const objs = await serialize(new Date(1234567890000));
      const date = deserialize(objs)[0] as Date;
      expect(date).toBeInstanceOf(Date);
      expect(date.toISOString()).toBe('2009-02-13T23:31:30.000Z');
    });
    it(title(TypeIds.Regex), async () => {
      const objs = await serialize(/abc/gm);
      const regex = deserialize(objs)[0] as RegExp;
      expect(regex).toBeInstanceOf(RegExp);
      expect(regex.toString()).toBe('/abc/gm');
    });
    it.todo(title(TypeIds.VNode));
    it(title(TypeIds.BigInt), async () => {
      const objs = await serialize(BigInt('12345678901234567890'));
      const bi = deserialize(objs)[0] as bigint;
      expect(bi).toBeTypeOf('bigint');
      expect(bi.toString()).toBe('12345678901234567890');
    });
    it(title(TypeIds.URLSearchParams), async () => {
      const objs = await serialize(new URLSearchParams({ a: '', b: '12' }));
      const url = deserialize(objs)[0] as URLSearchParams;
      expect(url).toBeInstanceOf(URLSearchParams);
      expect(url.toString()).toBe('a=&b=12');
    });
    it(title(TypeIds.Error), async () => {
      const objs = await serialize(new Error('hi'));
      const err = deserialize(objs)[0] as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('hi');
    });
    it(title(TypeIds.Promise), async () => {
      const objs = await serialize(Promise.resolve(shared1), Promise.reject(shared1), shared1);
      const [p1, p2, shared] = deserialize(objs);
      await expect(p1).resolves.toBe(shared);
      await expect(p2).rejects.toBe(shared);
    });
    it(title(TypeIds.Set), async () => {
      const objs = await serialize(shared1, new Set([shared1, ['hi']]));
      const arr = deserialize(objs);
      const obj = arr[0] as any;
      const set = arr[1] as Set<any>;
      expect(set).toMatchInlineSnapshot(`
        Set {
          {
            "shared": 1,
          },
          [
            "hi",
          ],
        }
      `);
      expect(set.has(obj)).toBeTruthy();
    });
    it(title(TypeIds.Map), async () => {
      const objs = await serialize(
        shared1,
        shared2,
        new Map<any, any>([
          ['shared', shared1],
          [shared2, shared1],
        ])
      );
      const [obj1, obj2, map] = deserialize(objs) as any[];
      expect(map.get('shared')).toBe(obj1);
      expect(map.get(obj2)).toBe(obj1);
    });
    it(title(TypeIds.Uint8Array), async () => {
      const objs = await serialize(new Uint8Array([0, 20, 128, 255]));
      const arr = deserialize(objs);
      expect(arr[0]).toBeInstanceOf(Uint8Array);
      expect(Array.from(arr[0] as any)).toEqual([0, 20, 128, 255]);
      expect(deserialize(await serialize(new Uint8Array([0])))).toEqual([new Uint8Array([0])]);
      expect(deserialize(await serialize(new Uint8Array([127, 129])))).toEqual([
        new Uint8Array([127, 129]),
      ]);
    });
    it(title(TypeIds.QRL), async () => {
      const myVar = 123;
      const other = 'hello';
      const objs = await serialize($(() => myVar + other));
      const qrl = deserialize(objs)[0] as QRLInternal;
      expect(isQrl(qrl)).toBeTruthy();
      expect(await (qrl.getFn() as any)()).toBe(myVar + other);
    });
    it(title(TypeIds.Task), async () => {
      const qrl = inlinedQrl(0, 's_zero') as any;
      const objs = await serialize(new Task(0, 0, shared1 as any, qrl, shared2 as any, null));
      const [task] = deserialize(objs) as Task[];
      expect(task.$qrl$.$symbol$).toEqual(qrl.$symbol$);
      expect(task.$el$).toEqual(shared1);
      expect(task.$state$).toEqual(shared2);
    });
    it(title(TypeIds.Resource), async () => {
      const res = createResourceReturn(null!, undefined, Promise.resolve(shared1));
      res._state = 'resolved';
      res._resolved = shared1;
      const objs = await serialize(res);
      const restored = deserialize(objs)[0] as any;
      const value = await restored.value;
      expect(value).toEqual(shared1);
      expect(restored._state).toBe('resolved');
      // TODO requires a domcontainer
      // also not sure if this holds true
      // the promise result isn't a store
      // but the resource is
      // expect(restored._resolved).toBe(value);
    });
    it.todo(title(TypeIds.Component));
    it(title(TypeIds.Signal), async () => {
      const objs = await serialize(createSignal('hi'));
      const signal = deserialize(objs)[0] as SignalImpl;
      expect(isSignal(signal)).toBeTruthy();
      expect(signal.value).toBe('hi');
    });
    it.todo(title(TypeIds.WrappedSignal));
    it.todo(title(TypeIds.ComputedSignal));
    it.todo(title(TypeIds.SerializerSignal));
    // this requires a domcontainer
    it(title(TypeIds.Store), async () => {
      const orig: any = { a: { b: true } };
      orig.orig = orig;
      const storeSrc = createStore<any>(null, orig, StoreFlags.RECURSIVE);
      storeSrc.c = storeSrc; // circular ref
      orig.a.store = storeSrc;

      const objs = await serialize(orig, storeSrc);
      const [origRestored, store] = deserialize(objs) as any[];
      expect(store).toHaveProperty('a');
      expect(store.a).toHaveProperty('b', true);
      expect(store).toHaveProperty('c', store);
      expect(origRestored.orig).toBe(origRestored);
      expect(store.orig).toBe(store);
      expect(origRestored.a.store).toBe(store);
      expect(store.a.store).toBe(store);
      store.orig.hello = 123;
      expect((origRestored as any).hello).toBe(123);
    });
    it.todo(title(TypeIds.FormData));
    it.todo(title(TypeIds.JSXNode));
    it.todo(title(TypeIds.PropsProxy));
    it(title(TypeIds.SubscriptionData), async () => {
      const objs = await serialize(
        new SubscriptionData({ $isConst$: true, $scopedStyleIdPrefix$: null })
      );
      const effect = deserialize(objs)[0] as SubscriptionData;
      expect(effect).toBeInstanceOf(SubscriptionData);
      expect(effect.data).toEqual({ $isConst$: true, $scopedStyleIdPrefix$: null });
    });
  });

  describe('special cases', () => {
    it('EMPTY_ARRAY vs []', async () => {
      const a: any[] = [];
      const objs = await serialize(EMPTY_ARRAY, a);
      const arr = deserialize(objs);
      expect(arr[0]).toBe(EMPTY_ARRAY);
      expect(arr[1]).toEqual(a);
      expect(arr[1]).not.toBe(a);
      expect(arr[1]).not.toBe(EMPTY_ARRAY);
    });
    it('EMPTY_OBJ vs {}', async () => {
      const o = {};
      const objs = await serialize(EMPTY_OBJ, o);
      const arr = deserialize(objs);
      expect(arr[0]).toBe(EMPTY_OBJ);
      expect(arr[1]).toEqual(o);
      expect(arr[1]).not.toBe(o);
      expect(arr[1]).not.toBe(EMPTY_OBJ);
    });
  });

  describe('dedupe', () => {
    it('should dedupe identical objects/strings', async () => {
      const a = { hello: 1 };
      const objs = await serialize([
        'hello',
        'hello',
        a,
        a,
        12345678901234567890n,
        12345678901234567890n,
        // small bigint are not deduped
        9n,
        9n,
      ]);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Array [
          {string} "hello"
          RootRef 1
          Object [
            RootRef 1
            {number} 1
          ]
          RootRef 2
          BigInt "12345678901234567890"
          RootRef 3
          BigInt "9"
          BigInt "9"
        ]
        1 RootRef "0 0"
        2 RootRef "0 2"
        3 RootRef "0 4"
        (103 chars)"
      `);
    });
    it('should dedupe identical qrls', async () => {
      const fn = () => 'hi';
      const a = {};
      const qrl1 = inlinedQrl(fn, 'dump_qrl', [a]);
      const qrl2 = inlinedQrl(fn, 'dump_qrl', [a]);
      expect(qrl1).not.toBe(qrl2);
      const objs = await serialize(qrl1, [qrl2]);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 QRL "3 4 2"
        1 Array [
          RootRef 0
        ]
        2 Object []
        3 {string} "mock-chunk"
        4 {string} "dump_qrl"
        (53 chars)"
      `);
    });
    it('should dedupe identical root qrls', async () => {
      const fn = () => 'hi';
      const a = {};
      const qrl1 = inlinedQrl(fn, 'dump_qrl', [a]);
      const qrl2 = inlinedQrl(fn, 'dump_qrl', [a]);
      expect(qrl1).not.toBe(qrl2);
      const objs = await serialize(qrl1, qrl2);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 QRL "3 4 2"
        1 RootRef 0
        2 Object []
        3 {string} "mock-chunk"
        4 {string} "dump_qrl"
        (49 chars)"
      `);
    });
  });

  describe('Serialization Weak Ref', () => {
    const dump = async (...value: any) => _dumpState(await serialize(...value));
    it('should not serialize object', async () => {
      const parent = {
        child: { should: 'serialize' },
      };

      (parent as any)[SerializerSymbol] = () => ({
        child: _serializationWeakRef(parent.child),
      });

      expect(await dump(parent)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "child"
          ForwardRef 0
        ]
        1 ForwardRefs [
          -1
        ]
        (27 chars)"
      `);
    });
    it('should serialize object before qrl', async () => {
      const parent = {
        child: { should: 'serialize' },
      };

      (parent as any)[SerializerSymbol] = () => ({
        child: _serializationWeakRef(parent.child),
      });

      const qrl = inlinedQrl(() => parent.child.should, 'dump_qrl', [parent.child]);
      expect(await dump(parent, qrl)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "child"
          ForwardRef 0
        ]
        1 QRL "3 4 2"
        2 Object [
          {string} "should"
          {string} "serialize"
        ]
        3 {string} "mock-chunk"
        4 {string} "dump_qrl"
        5 ForwardRefs [
          2
        ]
        (94 chars)"
      `);
    });
    it('should serialize object after qrl', async () => {
      const parent = {
        child: { should: 'serialize' },
      };

      (parent as any)[SerializerSymbol] = () => ({
        child: _serializationWeakRef(parent.child),
      });

      const qrl = inlinedQrl(() => parent.child.should, 'dump_qrl', [parent.child]);
      expect(await dump(qrl, parent)).toMatchInlineSnapshot(`
        "
        0 QRL "3 4 2"
        1 Object [
          {string} "child"
          ForwardRef 0
        ]
        2 Object [
          {string} "should"
          {string} "serialize"
        ]
        3 {string} "mock-chunk"
        4 {string} "dump_qrl"
        5 ForwardRefs [
          2
        ]
        (94 chars)"
      `);
    });
  });

  describe('circular references', () => {
    it('should not detect any circular references', async () => {
      const objs = await serialize({ a: 1 });
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "a"
          {number} 1
        ]
        (15 chars)"
      `);
    });
    it('should handle circular references', async () => {
      const obj1 = {};
      const obj2 = { obj1 };
      (obj1 as any)['self'] = obj1;
      (obj2 as any)['self'] = obj2;
      (obj1 as any)['obj2'] = obj2;

      const objs = await serialize([obj1, obj2]);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Array [
          Object [
            {string} "self"
            RootRef 1
            {string} "obj2"
            Object [
              {string} "obj1"
              RootRef 1
              RootRef 2
              RootRef 3
            ]
          ]
          RootRef 3
        ]
        1 RootRef "0 0"
        2 RootRef "0 0 0"
        3 RootRef "0 0 3"
        (88 chars)"
      `);
    });
    it('should scan Promise results', async () => {
      const objs = await serialize(Promise.resolve(shared1), Promise.reject(shared1));
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 ForwardRef 0
        1 ForwardRef 1
        2 Promise [
          Constant true
          Object [
            {string} "shared"
            {number} 1
          ]
        ]
        3 Promise [
          Constant false
          RootRef 4
        ]
        4 RootRef "2 1"
        5 ForwardRefs [
          2
          3
        ]
        (67 chars)"
      `);
      expect(objs).toHaveLength(6 * 2);
    });
    it('should await Promises in Promises', async () => {
      const objs = await serialize(Promise.resolve({ hi: Promise.resolve(shared1) }));
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 ForwardRef 0
        1 Promise [
          Constant true
          Object [
            {string} "hi"
            ForwardRef 1
          ]
        ]
        2 Promise [
          Constant true
          Object [
            {string} "shared"
            {number} 1
          ]
        ]
        3 ForwardRefs [
          1
          2
        ]
        (66 chars)"
      `);
    });
    it('should dedupe function sub-data', async () => {
      const objs = await serialize([shared1], createQRL(null, 'foo', 123, null, null, [shared1]));
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Array [
          Object [
            {string} "shared"
            {number} 1
          ]
        ]
        1 QRL "3 4 2"
        2 RootRef "0 0"
        3 {string} "mock-chunk"
        4 {string} "foo"
        (66 chars)"
      `);
      // make sure shared1 is only serialized once
      expect([objs[4], objs[5]]).toEqual([TypeIds.RootRef, '0 0']);
    });
  });

  describe('lazy deserialization', () => {
    it('should deserialize data', async () => {
      const stateData = await serialize(0, undefined, 'hi');
      expect(stateData.every((v) => v != null)).toBeTruthy();
      const proxy = deserialize(stateData);
      expect(proxy).toEqual([0, undefined, 'hi']);
      expect(stateData).toEqual([0, 0, 0, undefined, 0, 'hi']);
    });
    it('should refer to roots', async () => {
      const stateData = await serialize(shared1, [shared1]);
      expect(stateData.every((v) => v != null)).toBeTruthy();
      const proxy = deserialize(stateData);
      const obj = proxy[0];
      expect(proxy).toEqual([obj, [obj]]);
      expect(stateData).toEqual([0, obj, 0, [obj]]);
    });
    it('should allow assign new value', async () => {
      const stateData = await serialize({ shared: { shared1 } });
      expect(stateData.every((v) => v != null)).toBeTruthy();
      const proxy = deserialize(stateData);
      const obj = proxy[0];
      const newValue = { shared2 };
      (obj as any).shared = newValue;
      expect((obj as any).shared).toBe(newValue);
    });
  });

  describe('custom serialization', () => {
    it('should ignore noSerialize', async () => {
      const obj = { hi: true };
      const state = await serialize(noSerialize(obj));
      expect(_dumpState(state)).toMatchInlineSnapshot(`
        "
        0 Constant undefined
        (5 chars)"
      `);
    });
    it('should ignore functions in noSerialize set', async () => {
      const obj = { hi: true, ignore: noSerialize(() => console.warn()) };
      const state = await serialize(obj);
      expect(_dumpState(state)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "hi"
          Constant true
        ]
        (16 chars)"
      `);
    });
    it('should ignore functions with NoSerializeSymbol', async () => {
      const ignore = () => console.warn();
      (ignore as any)[NoSerializeSymbol] = true;
      const obj = { hi: true, ignore };
      const state = await serialize(obj);
      expect(_dumpState(state)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "hi"
          Constant true
        ]
        (16 chars)"
      `);
    });
    it('should ignore NoSerializeSymbol', async () => {
      const obj = { hi: true, [NoSerializeSymbol]: true };
      const state = await serialize(obj);
      expect(_dumpState(state)).toMatchInlineSnapshot(`
        "
        0 Constant undefined
        (5 chars)"
      `);
    });
    it('should use SerializerSymbol', async () => {
      const obj = { hi: 'obj', [SerializerSymbol]: (o: any) => o.hi };
      class Foo {
        hi = 'class';
        [SerializerSymbol]() {
          return this.hi;
        }
      }
      const state = await serialize([obj, new Foo(), new MyCustomSerializable(1)]);
      expect(_dumpState(state)).toMatchInlineSnapshot(`
        "
        0 Array [
          {string} "obj"
          {string} "class"
          {number} 1
        ]
        (27 chars)"
      `);
    });
    it('should not use SerializerSymbol if not function', async () => {
      const obj = { hi: 'orig', [SerializerSymbol]: 'hey' };
      const state = await serialize(obj);
      expect(_dumpState(state)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "hi"
          {string} "orig"
        ]
        (21 chars)"
      `);
    });
    it('should unwrap promises from SerializerSymbol', async () => {
      class Foo {
        hi = 'promise';
        async [SerializerSymbol]() {
          return Promise.resolve(this.hi);
        }
      }
      const state = await serialize(new Foo());
      expect(_dumpState(state)).toMatchInlineSnapshot(`
        "
        0 ForwardRef 0
        1 {string} "promise"
        2 ForwardRefs [
          1
        ]
        (24 chars)"
      `);
    });
    it('should object returned from SerializerSymbol and from promise be the same', async () => {
      const obj = {
        test: 'test',
      };
      const promise = Promise.resolve(obj);
      class Foo {
        hi = obj;
        async [SerializerSymbol]() {
          return Promise.resolve(this.hi);
        }
      }
      const state = await serialize([promise, new Foo()]);
      expect(_dumpState(state)).toMatchInlineSnapshot(`
        "
        0 Array [
          ForwardRef 0
          ForwardRef 1
        ]
        1 Promise [
          Constant true
          Object [
            {string} "test"
            RootRef 2
          ]
        ]
        2 RootRef "1 1 0"
        3 Object [
          RootRef 2
          RootRef 2
        ]
        4 ForwardRefs [
          1
          3
        ]
        (70 chars)"
      `);
    });
  });
  it('should throw rejected promises from SerializerSymbol', async () => {
    const consoleSpy = vi.spyOn(console, 'error');

    class Foo {
      hi = 'promise';
      async [SerializerSymbol]() {
        throw 'oh no';
      }
    }
    await expect(serialize(new Foo())).rejects.toThrow(
      'Q' + QError.serializerSymbolRejectedPromise
    );
    expect(consoleSpy).toHaveBeenCalledWith('oh no');
    consoleSpy.mockRestore();
  });
});

async function serialize(...roots: any[]): Promise<any[]> {
  const sCtx = createSerializationContext(
    null,
    null,
    () => '',
    () => '',
    () => '',
    new WeakMap<any, any>(),
    null!
  );
  for (const root of roots) {
    sCtx.$addRoot$(root, null);
  }
  await sCtx.$serialize$();
  const objs = JSON.parse(sCtx.$writer$.toString());
  // eslint-disable-next-line no-console
  DEBUG && console.log(objs);
  return objs;
}

class MyCustomSerializable {
  constructor(public n: number) {}
  inc() {
    this.n++;
  }
  [SerializerSymbol]() {
    return this.n;
  }
}
