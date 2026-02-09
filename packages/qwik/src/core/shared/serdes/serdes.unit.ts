import {
  $,
  _verifySerializable,
  componentQrl,
  createAsync$,
  createComputed$,
  createSerializer$,
  createSignal,
  isSignal,
  noSerialize,
  NoSerializeSymbol,
  SerializerSymbol,
  type AsyncSignal,
} from '@qwik.dev/core';
import { describe, expect, it, vi } from 'vitest';
import { _deserialize, _fnSignal, _serialize, _wrapProp } from '../../internal';
import type { SerializerSignalImpl } from '../../reactive-primitives/impl/serializer-signal-impl';
import { type SignalImpl } from '../../reactive-primitives/impl/signal-impl';
import { createStore } from '../../reactive-primitives/impl/store';
import { createAsyncSignal } from '../../reactive-primitives/signal-api';
import { SubscriptionData } from '../../reactive-primitives/subscription-data';
import {
  EffectProperty,
  EffectSubscription,
  SignalFlags,
  StoreFlags,
} from '../../reactive-primitives/types';
import { createResourceReturn } from '../../use/use-resource';
import { Task } from '../../use/use-task';
import { QError } from '../error/error';
import { inlinedQrl } from '../qrl/qrl';
import { createQRL, type QRLInternal } from '../qrl/qrl-class';
import { isQrl } from '../qrl/qrl-utils';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../utils/flyweight';
import { retryOnPromise } from '../utils/promises';
import { _constants, _typeIdNames, TypeIds } from './constants';
import { _dumpState } from './dump-state';
import { _createDeserializeContainer } from './serdes.public';
import { createSerializationContext } from './serialization-context';
import { _serializationWeakRef } from './serialize';
import type { AsyncSignalImpl } from '../../reactive-primitives/impl/async-signal-impl';

const DEBUG = false;

const title = (typeId: TypeIds) => `${typeId} ${_typeIdNames[typeId]}`;

// Keep the tests in typeId order so it's easy to see if we missed one
describe('shared-serialization', () => {
  const shared1 = { shared: 1 };
  const shared2 = { shared: 2 };

  describe('serialize types', () => {
    const dump = async (...value: any) =>
      _dumpState(await serialize(..._verifySerializable(value)));
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
        3 RootRef "2 0"
        (72 chars)"
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
          {string} "Error: hi\\n    at /...path/file.ts:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\n    at new Promise (<anonymous>)\\n    at runWithTimeout (file:/...path/file.js:123:456)\\n    at file:/...path/file.js:123:456\\n    at Traces.$ (file:/...path/file.js:123:456)\\n    at trace (file:/...path/file.js:123:456)\\n    at runTest (file:/...path/file.js:123:456)"
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
          {string} "Error: hi\\n    at /...path/file.ts:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\n    at new Promise (<anonymous>)\\n    at runWithTimeout (file:/...path/file.js:123:456)\\n    at file:/...path/file.js:123:456\\n    at Traces.$ (file:/...path/file.js:123:456)\\n    at trace (file:/...path/file.js:123:456)\\n    at runTest (file:/...path/file.js:123:456)"
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
          0 QRL "3#4#1 2"
          1 {number} 123
          2 {string} "hello"
          3 {string} "mock-chunk"
          4 {string} "dump_qrl"
          (57 chars)"
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
          QRL "2#3#1"
          {number} 0
          {number} 0
          RootRef 1
          Constant undefined
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
        (101 chars)"
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
        ]
        2 ForwardRefs [
          1
        ]
        (27 chars)"
      `);
    });
    it(title(TypeIds.Component), async () => {
      expect(
        await dump(componentQrl(inlinedQrl(() => 'hi', 'dump_component')))
      ).toMatchInlineSnapshot(
        `
        "
        0 Component [
          QRL "1#2"
        ]
        1 {string} "mock-chunk"
        2 {string} "dump_component"
        (48 chars)"
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

      const objsNull = await serialize({ foo: createSignal(null) });
      expect(_dumpState(objsNull)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "foo"
          Signal [
            Constant null
          ]
        ]
        (22 chars)"
      `);

      // undefined signal without effects
      const undefinedSignal = createSignal(undefined);
      const objsUndefined = await serialize({ foo: undefinedSignal });
      expect(_dumpState(objsUndefined)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "foo"
          Signal [
            Constant undefined
          ]
        ]
        (22 chars)"
      `);

      // undefined signal with effects
      const ctxSignal = createSignal('test');
      const effectSubscription = new EffectSubscription(
        ctxSignal as SignalImpl,
        EffectProperty.COMPONENT,
        null,
        null
      );
      (undefinedSignal as SignalImpl).$effects$ = new Set([effectSubscription]);

      const objsUndefinedWithEffects = await serialize({ foo: undefinedSignal });
      expect(_dumpState(objsUndefinedWithEffects)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "foo"
          Signal [
            Constant undefined
            EffectSubscription [
              Signal [
                {string} "test"
              ]
              {string} ":"
              Constant null
              Constant null
            ]
          ]
        ]
        (55 chars)"
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
          Constant undefined
          {number} 5
        ]
        1 WrappedSignal [
          {number} 1
          Array [
            Signal [
              {number} 3
              EffectSubscription [
                RootRef 1
                {string} "."
                Set [
                  RootRef 2
                ]
                Constant null
              ]
            ]
            {string} "value"
          ]
          Map [
            {string} "."
            RootRef 3
          ]
          {number} 7
        ]
        2 RootRef "1 1 0"
        3 RootRef "2 1"
        (123 chars)"
      `);
    });
    it(title(TypeIds.ComputedSignal), async () => {
      const foo = createSignal(0);
      const dirty = createComputed$(() => foo.value + 1, { serializationStrategy: 'always' });
      const clean = createComputed$(() => foo.value + 2, { serializationStrategy: 'always' });
      const never = createComputed$(() => foo.value + 3, { serializationStrategy: 'never' });
      const always = createComputed$(() => foo.value + 4, { serializationStrategy: 'always' });
      const noSer = createComputed$(() => noSerialize({ foo }));
      // note that this won't subscribe because we're not setting up the context
      // do not read `dirty` to keep it dirty
      expect(clean.value).toBe(2);
      expect(never.value).toBe(3);
      expect(always.value).toBe(4);
      const objs = await serialize(dirty, clean, never, always, noSer);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 ComputedSignal [
          QRL "6#7#5"
        ]
        1 ComputedSignal [
          QRL "6#8#5"
          Constant undefined
          Constant undefined
          {number} 2
        ]
        2 ComputedSignal [
          QRL "6#9#5"
        ]
        3 ComputedSignal [
          QRL "6#10#5"
          Constant undefined
          Constant undefined
          {number} 4
        ]
        4 ComputedSignal [
          QRL "6#11#5"
        ]
        5 Signal [
          {number} 0
        ]
        6 {string} "mock-chunk"
        7 {string} "describe_describe_it_dirty_createComputed_ahnh0V4rf6g"
        8 {string} "describe_describe_it_clean_createComputed_0ZTfN4iJ0tg"
        9 {string} "describe_describe_it_never_createComputed_1HbLed7JXyo"
        10 {string} "describe_describe_it_always_createComputed_4nMmgHlUOog"
        11 {string} "describe_describe_it_noSer_createComputed_pXwl00hYYQQ"
        (417 chars)"
      `);
    });
    it(title(TypeIds.SerializerSignal), async () => {
      const plain = createSerializer$({
        deserialize: (n?: number) => new MyCustomSerializable(n || 3),
        serialize: (obj) => obj.n,
      });
      // Force the value to be created
      plain.value.inc();
      const unread = createSerializer$({
        deserialize: (n?: number) => new MyCustomSerializable(n || 3),
        serialize: (obj) => obj.n,
        initial: 7,
      });
      const thunked = createSerializer$(() => ({
        deserialize: (n?: number) => new MyCustomSerializable(n || 3),
        serialize: (obj) => obj.n,
      }));
      thunked.value.inc();
      const promised = createSerializer$(() => ({
        deserialize: (n?: number) => new MyCustomSerializable(n || 3),
        serialize: (obj) => obj.n,
      })) as any as SerializerSignalImpl<MyCustomSerializable, number>;
      promised.value.inc();
      // Fake promise
      promised.$computeQrl$.resolved = Promise.resolve(promised.$computeQrl$.resolved) as any;
      const unreadPromise = createSerializer$({
        deserialize: (n?: number) => new MyCustomSerializable(n || 3),
        serialize: (obj) => obj.n,
        initial: 7,
      }) as any as SerializerSignalImpl<MyCustomSerializable, number>;
      unreadPromise.$computeQrl$.resolved = Promise.resolve(promised.$computeQrl$.resolved) as any;

      const objs = await serialize([plain, unread, thunked, promised, unreadPromise]);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Array [
          SerializerSignal [
            QRL "1#2"
            Constant undefined
            Constant undefined
            {number} 4
          ]
          SerializerSignal [
            QRL "1#3"
            Constant undefined
            Constant undefined
            Constant NEEDS_COMPUTATION
          ]
          SerializerSignal [
            QRL "1#4"
            Constant undefined
            Constant undefined
            {number} 4
          ]
          ForwardRef 0
          SerializerSignal [
            QRL "1#5"
            Constant undefined
            Constant undefined
            Constant NEEDS_COMPUTATION
          ]
        ]
        1 {string} "mock-chunk"
        2 {string} "describe_describe_it_plain_createSerializer_IrZN04alftE"
        3 {string} "describe_describe_it_unread_createSerializer_oYdaCRjw9Q0"
        4 {string} "describe_describe_it_thunked_createSerializer_ufw7hr9vFDo"
        5 {string} "describe_describe_it_unreadPromise_createSerializer_8vLYtMSnQio"
        6 SerializerSignal [
          QRL "1#7"
          Constant undefined
          {number} 4
        ]
        7 {string} "describe_describe_it_promised_createSerializer_YCkDOYPyCO0"
        8 ForwardRefs [
          6
        ]
        (466 chars)"
      `);
    });
    it(title(TypeIds.AsyncSignal), async () => {
      const foo = createSignal(1);
      const dirty = createAsyncSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'dirty',
          [foo]
        )
      );
      const clean = createAsyncSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'clean',
          [foo]
        )
      );

      const never = createAsyncSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'never',
          [foo]
        ),
        {
          serializationStrategy: 'never',
        }
      );

      const always = createAsyncSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'always',
          [foo]
        ),
        {
          serializationStrategy: 'always',
        }
      );
      const polling = createAsyncSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'polling',
          [foo]
        ),
        { pollMs: 100 }
      );
      const concurrent = createAsyncSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'concurrent',
          [foo]
        ),
        { concurrency: 23 }
      );
      const timeout = createAsyncSignal(
        inlinedQrl(
          ({ track }) => Promise.resolve(track(() => (foo as SignalImpl).value) + 1),
          'timeout',
          [foo]
        ),
        { timeout: 5000 }
      );

      await retryOnPromise(() => {
        // note that this won't subscribe because we're not setting up the context
        expect(clean.value).toBe(2);
        expect(never.value).toBe(2);
        expect(always.value).toBe(2);
      });

      const objs = await serialize(dirty, clean, never, always, polling, concurrent, timeout);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 AsyncSignal [
          QRL "8#9#7"
        ]
        1 AsyncSignal [
          QRL "8#10#7"
          Map [
            {string} ":"
            EffectSubscription [
              RootRef 1
              {string} ":"
              Set [
                RootRef 7
              ]
              Constant null
            ]
          ]
          Constant undefined
          Constant undefined
          Constant undefined
          Constant undefined
          {number} 2
        ]
        2 AsyncSignal [
          QRL "8#11#7"
          Map [
            {string} ":"
            EffectSubscription [
              RootRef 2
              {string} ":"
              Set [
                RootRef 7
              ]
              Constant null
            ]
          ]
        ]
        3 AsyncSignal [
          QRL "8#12#7"
          Map [
            {string} ":"
            EffectSubscription [
              RootRef 3
              {string} ":"
              Set [
                RootRef 7
              ]
              Constant null
            ]
          ]
          Constant undefined
          Constant undefined
          Constant undefined
          Constant undefined
          {number} 2
        ]
        4 AsyncSignal [
          QRL "8#13#7"
          Constant undefined
          Constant undefined
          Constant undefined
          Constant undefined
          Constant undefined
          Constant NEEDS_COMPUTATION
          {number} 100
        ]
        5 AsyncSignal [
          QRL "8#14#7"
          Constant undefined
          Constant undefined
          Constant undefined
          Constant undefined
          Constant undefined
          Constant NEEDS_COMPUTATION
          Constant undefined
          {number} 23
        ]
        6 AsyncSignal [
          QRL "8#15#7"
          Constant undefined
          Constant undefined
          Constant undefined
          Constant undefined
          Constant undefined
          Constant NEEDS_COMPUTATION
          Constant undefined
          Constant undefined
          {number} 5000
        ]
        7 Signal [
          {number} 1
          RootRef 16
          RootRef 17
          RootRef 18
        ]
        8 {string} "mock-chunk"
        9 {string} "dirty"
        10 {string} "clean"
        11 {string} "never"
        12 {string} "always"
        13 {string} "polling"
        14 {string} "concurrent"
        15 {string} "timeout"
        16 RootRef "1 1 1"
        17 RootRef "2 1 1"
        18 RootRef "3 1 1"
        (520 chars)"
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
        2 RootRef "1 1 3"
        (93 chars)"
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
    it(title(TypeIds.RootRef) + ' - backrefs', async () => {
      const a = { a: 1 };
      const b = { b: { a } };
      const c = { c: { a, b } };
      const objs = await serialize([a, [c], [b], c]);
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Array [
          Object [
            {string} "a"
            {number} 1
          ]
          Array [
            Object [
              {string} "c"
              Object [
                {string} "a"
                RootRef 1
                {string} "b"
                Object [
                  {string} "b"
                  Object [
                    {string} "a"
                    RootRef 1
                  ]
                ]
              ]
            ]
          ]
          Array [
            RootRef 2
          ]
          RootRef 3
        ]
        1 RootRef "0 0"
        2 RootRef "0 1 0 1 3"
        3 RootRef "0 1 0"
        (121 chars)"
      `);
      const arr = deserialize(objs)[0] as any[];
      expect(arr[0]).toBe(arr[1][0].c.a);
      expect(arr[0]).toBe(arr[2][0].b.a);
      expect(arr[0]).toBe(arr[3].c.a);
      expect(arr[2][0]).toBe(arr[3].c.b);
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
    it(`${title(TypeIds.AsyncSignal)} valid`, async () => {
      const asyncSignal = createAsync$(async () => 123);
      expect((asyncSignal as AsyncSignalImpl<number>).$flags$ & SignalFlags.INVALID).toBeTruthy();
      await asyncSignal.promise();
      expect((asyncSignal as AsyncSignalImpl<number>).$untrackedValue$).toBe(123);
      const objs = await serialize(asyncSignal);
      const restored = deserialize(objs)[0] as AsyncSignal<number>;
      expect(isSignal(restored)).toBeTruthy();
      expect((restored as AsyncSignalImpl<number>).$untrackedValue$).toBe(123);
      expect((restored as AsyncSignalImpl<number>).$flags$ & SignalFlags.INVALID).toBeFalsy();
    });
    it(`${title(TypeIds.AsyncSignal)} invalid`, async () => {
      const asyncSignal = createAsync$(async () => 123, {
        pollMs: 50,
        timeout: 1000,
        concurrency: 3,
      });
      const objs = await serialize(asyncSignal);
      const restored = deserialize(objs)[0] as AsyncSignal<number>;
      expect(isSignal(restored)).toBeTruthy();
      expect((restored as AsyncSignalImpl<number>).$pollMs$).toBe(50);
      expect((restored as AsyncSignalImpl<number>).$flags$ & SignalFlags.INVALID).toBeTruthy();
      await restored.promise();
      expect((restored as AsyncSignalImpl<number>).$untrackedValue$).toBe(123);
      expect((restored as AsyncSignalImpl<number>).$concurrency$).toBe(3);
      expect((restored as AsyncSignalImpl<number>).$timeoutMs$).toBe(1000);
    });
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
        0 QRL "3#4#2"
        1 Array [
          RootRef 0
        ]
        2 Object 0
        3 {string} "mock-chunk"
        4 {string} "dump_qrl"
        (51 chars)"
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
        0 QRL "3#4#2"
        1 RootRef 0
        2 Object 0
        3 {string} "mock-chunk"
        4 {string} "dump_qrl"
        (47 chars)"
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
        (19 chars)"
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
        1 QRL "3#4#2"
        2 Object [
          {string} "should"
          {string} "serialize"
        ]
        3 {string} "mock-chunk"
        4 {string} "dump_qrl"
        5 ForwardRefs [
          2
        ]
        (93 chars)"
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
      expect(await dump(parent, qrl)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "child"
          ForwardRef 0
        ]
        1 QRL "3#4#2"
        2 Object [
          {string} "should"
          {string} "serialize"
        ]
        3 {string} "mock-chunk"
        4 {string} "dump_qrl"
        5 ForwardRefs [
          2
        ]
        (93 chars)"
      `);
    });
    it('should not serialize multipe same weak ref', async () => {
      const parent = {
        child: { should: 'serialize' },
      };

      (parent as any)[SerializerSymbol] = () => ({
        child1: _serializationWeakRef(parent.child),
        child2: _serializationWeakRef(parent.child),
      });

      expect(await dump(parent)).toMatchInlineSnapshot(`
        "
        0 Object [
          {string} "child1"
          ForwardRef 0
          {string} "child2"
          ForwardRef 0
        ]
        (35 chars)"
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
        2 RootRef "1 0"
        3 RootRef "1 3"
        (84 chars)"
      `);
      const result = deserialize(objs)[0] as any[];
      expect(result[0].self).toBe(result[0]);
      expect(result[1].self).toBe(result[1]);
      expect(result[0].obj2).toBe(result[1]);
      expect(result[1].obj1).toBe(result[0]);
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
      const objs = await serialize([shared1], createQRL(null, 'foo', 123, null, [shared1]));
      expect(_dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Array [
          Object [
            {string} "shared"
            {number} 1
          ]
        ]
        1 QRL "3#4#2"
        2 RootRef "0 0"
        3 {string} "mock-chunk"
        4 {string} "foo"
        (65 chars)"
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
    it('object returned from SerializerSymbol and from promise should be the same', async () => {
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
        3 RootRef "1 1"
        4 ForwardRefs [
          1
          3
        ]
        (66 chars)"
      `);
      const result = deserialize(state)[0] as any[];
      expect(await result[0]).toBe(result[1]);
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

describe('serializer - internal', () => {
  it('_serialize', async () => {
    const a = { a: 1 };
    const ser = await _serialize({ a, b: [a] });
    expect(ser).toMatchInlineSnapshot(`"[5,[0,"a",5,[0,"a",0,1],0,"b",4,[1,1]],1,"0 1"]"`);
  });
  it('_deserialize', async () => {
    const ser = await _serialize({ a: 1 });
    const des = _deserialize(ser);
    expect(des).toEqual({ a: 1 });
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
    sCtx.$addRoot$(root);
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
