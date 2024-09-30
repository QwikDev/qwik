import { describe, it, expect } from 'vitest';
import {
  TypeIds,
  _constants,
  _createDeserializeContainer,
  _deserialize,
  _eagerDeserializeArray,
  _serialize,
  _typeIdNames,
  createSerializationContext,
  dumpState,
} from './shared-serialization';
import { Task } from '../use/use-task';
import { inlinedQrl } from './qrl/qrl';
import { isQrl, type QRLInternal } from './qrl/qrl-class';
import { EMPTY_ARRAY, EMPTY_OBJ } from './utils/flyweight';
import { createComputed$, createSignal, isSignal } from '../signal/signal.public';
import { _fnSignal, _wrapProp } from '../internal';
import { $, component$, getDomContainer, type ClientContainer } from '@builder.io/qwik';
import { createResourceReturn } from '../use/use-resource';
import { StoreFlags, createStore } from '../signal/store';
import { EffectData, type Signal } from '../signal/signal';
import type { SSRContainer } from '../ssr/ssr-types';
import { ssrCreateContainer } from '../../server/ssr-container';

const DEBUG = false;

const title = (typeId: TypeIds) => `${typeId} ${_typeIdNames[typeId]}`;

// Keep the tests in typeId order so it's easy to see if we missed one
describe('shared-serialization', () => {
  const shared1 = { shared: 1 };
  const shared2 = { shared: 2 };

  describe('serialize types', () => {
    const dump = async (...value: any) => dumpState(await serialize(...value));

    it(title(TypeIds.RootRef), async () => {
      expect(await dump([shared1, shared1])).toMatchInlineSnapshot(`
        "
        0 Array [
          RootRef 1
          RootRef 1
        ]
        1 Object [
          String "shared"
          Number 1
        ]
        (33 chars)"
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
        8 Constant Slot
        9 Constant Fragment
        10 Constant NaN
        11 Constant Infinity
        12 Constant -Infinity
        (56 chars)"
      `);
    });
    it(title(TypeIds.Number), async () => {
      expect(await dump(123)).toMatchInlineSnapshot(`
        "
        0 Number 123
        (7 chars)"
      `);
    });
    it(title(TypeIds.String), async () => {
      expect(await dump('hi')).toMatchInlineSnapshot(`
        "
        0 String "hi"
        (8 chars)"
      `);
      // make sure we're not serializing the same string twice
      expect(await dump(['long'], 'long')).toMatchInlineSnapshot(`
        "
        0 Array [
          RootRef 1
        ]
        1 String "long"
        (18 chars)"
      `);
    });
    it(title(TypeIds.Array), async () => {
      expect(await dump([0, null, 'hello'])).toMatchInlineSnapshot(`
        "
        0 Array [
          Number 0
          Constant null
          String "hello"
        ]
        (23 chars)"
      `);
    });
    it(title(TypeIds.URL), async () => {
      expect(await dump(new URL('http://example.com:80/'))).toMatchInlineSnapshot(`
        "
        0 URL "http://example.com/"
        (25 chars)"
      `);
    });
    it(title(TypeIds.Date), async () => {
      expect(await dump(new Date('2020-01-02T12:34'))).toMatchInlineSnapshot(`
        "
        0 Date "2020-01-02T11:34:00.000Z"
        (30 chars)"
      `);
    });
    it(title(TypeIds.Regex), async () => {
      expect(await dump(/abc/gm)).toMatchInlineSnapshot(`
        "
        0 Regex "/abc/gm"
        (13 chars)"
      `);
    });
    // TODO how to make a vnode?
    it.todo(title(TypeIds.VNode));
    it(title(TypeIds.BigInt), async () => {
      expect(await dump(BigInt('12345678901234567890'))).toMatchInlineSnapshot(
        `
        "
        0 BigInt "12345678901234567890"
        (26 chars)"
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
        .stack!.replaceAll(/\/.*\./g, '/...path/file.')
        .replaceAll(/:\d+:\d+/g, ':123:456');
      expect(await dump(err)).toMatchInlineSnapshot(`
        "
        0 Error [
          String "hi"
          String "Error: hi\\n    at /...path/file.ts:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\"...
        ]
        (509 chars)"
      `);
      (err as any).extra = 'yey';
      expect(await dump(err)).toMatchInlineSnapshot(`
        "
        0 Error [
          String "hi"
          Array [
            String "extra"
            String "yey"
          ]
          String "Error: hi\\n    at /...path/file.ts:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\"...
        ]
        (531 chars)"
      `);
    });
    it(title(TypeIds.Object), async () => {
      const objs = await serialize({ foo: shared1 }, { bar: shared1, shared: true });
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Object [
          String "foo"
          RootRef 3
        ]
        1 Object [
          String "bar"
          RootRef 3
          RootRef 2
          Constant true
        ]
        2 String "shared"
        3 Object [
          RootRef 2
          Number 1
        ]
        (67 chars)"
      `);
      expect(objs).toHaveLength(4 * 2);
    });
    it(title(TypeIds.Promise), async () => {
      expect(await dump(Promise.resolve(shared1), Promise.reject(shared2))).toMatchInlineSnapshot(`
        "
        0 Promise [
          Constant true
          Object [
            RootRef 2
            Number 1
          ]
        ]
        1 Promise [
          Constant false
          Object [
            RootRef 2
            Number 2
          ]
        ]
        2 String "shared"
        (56 chars)"
      `);
    });
    it(title(TypeIds.Set), async () => {
      expect(await dump(new Set([shared1, [shared1]]))).toMatchInlineSnapshot(
        `
        "
        0 Set [
          RootRef 1
          Array [
            RootRef 1
          ]
        ]
        1 Object [
          String "shared"
          Number 1
        ]
        (38 chars)"
      `
      );
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
          RootRef 1
          RootRef 2
          Object [
            RootRef 1
            Number 2
          ]
          RootRef 2
        ]
        1 String "shared"
        2 Object [
          RootRef 1
          Number 1
        ]
        (55 chars)"
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
      expect(await dump($(() => myVar + other))).toMatchInlineSnapshot(`
        "
        0 QRL "mock-chunk#describe_describe_it_expect_dump_cNbqnZa8lvE[1 2]"
        1 Number 123
        2 String "hello"
        (83 chars)"
      `);
    });
    it(title(TypeIds.Task), async () => {
      expect(
        await dump(
          new Task(0, 0, shared1 as any, $(() => shared1) as QRLInternal, shared2 as any, null)
        )
      ).toMatchInlineSnapshot(`
        "
        0 Task [
          QRL "mock-chunk#describe_describe_it_expect_dump_1_EfBKC5CDrtE[2]"
          Number 0
          Number 0
          RootRef 2
          Constant null
          Object [
            RootRef 1
            Number 2
          ]
        ]
        1 String "shared"
        2 Object [
          RootRef 1
          Number 1
        ]
        (125 chars)"
      `);
    });
    it(title(TypeIds.Resource), async () => {
      // Note: we just serialize as a store
      const res = createResourceReturn(null!, undefined, Promise.resolve(123));
      res._state = 'resolved';
      res._resolved = 123;
      expect(await dump(res)).toMatchInlineSnapshot(`
        "
        0 Resource [
          Constant true
          Number 123
          Constant null
        ]
        (20 chars)"
      `);
    });
    it(title(TypeIds.Component), async () => {
      expect(await dump(component$(() => 'hi'))).toMatchInlineSnapshot(
        `
        "
        0 Component [
          QRL "mock-chunk#describe_describe_it_expect_dump_component_vSVQcZKRFqg"
        ]
        (77 chars)"
      `
      );
    });
    it(title(TypeIds.Signal), async () => {
      const objs = await serialize({ foo: createSignal('hi') });
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Object [
          String "foo"
          Signal [
            String "hi"
          ]
        ]
        (26 chars)"
      `);
    });
    it(title(TypeIds.WrappedSignal), async () => {
      const objs = await serialize(
        _fnSignal((p0) => p0 + 1, [3], '(p0)=>p0+1'),
        _wrapProp({})
      );
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 WrappedSignal [
          Number 0
          Array [
            Number 3
          ]
          Constant null
          Number 4
        ]
        1 WrappedSignal [
          Number 1
          Array [
            Object []
            String "value"
          ]
          Constant null
          Constant undefined
        ]
        (63 chars)"
      `);
    });
    it(title(TypeIds.ComputedSignal), async () => {
      const foo = createSignal(1);
      const dirty = createComputed$(() => foo.value + 1);
      const clean = createComputed$(() => foo.value + 1);
      // note that this won't subscribe because we're not setting up the context
      expect(clean.value).toBe(2);
      const objs = await serialize(dirty, clean);
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 ComputedSignal [
          QRL "mock-chunk#describe_describe_it_dirty_createComputed_ThF0rSoSl0g[2]"
          Constant NEEDS_COMPUTATION
          Constant true
        ]
        1 ComputedSignal [
          QRL "mock-chunk#describe_describe_it_clean_createComputed_lg4WQTKvF1k[2]"
          Number 2
          Constant false
        ]
        2 Signal [
          Number 1
        ]
        (182 chars)"
      `);
    });
    it(title(TypeIds.Store), async () => {
      expect(await dump(createStore(null, { a: { b: true } }, StoreFlags.RECURSIVE)))
        .toMatchInlineSnapshot(`
          "
          0 Store [
            Object [
              String "a"
              Object [
                String "b"
                Constant true
              ]
            ]
            Number 1
          ]
          (36 chars)"
        `);
    });
    it.todo(title(TypeIds.FormData));
    it.todo(title(TypeIds.JSXNode));
    it.todo(title(TypeIds.PropsProxy));
    it(title(TypeIds.EffectData), async () => {
      expect(await dump(new EffectData({ hi: true }))).toMatchInlineSnapshot(`
        "
        0 EffectData [
          Object [
            String "hi"
            Constant true
          ]
        ]
        (22 chars)"
      `);
    });
  });

  const deserialize = (data: unknown[]) => {
    const container = _createDeserializeContainer(data);
    return container.$state$!;
  };

  describe('deserialize types', () => {
    it(title(TypeIds.RootRef), async () => {
      const objs = await serialize(shared1, { hi: shared1 });
      const arr = deserialize(objs);
      expect(arr[0]).toBe((arr[1] as any).hi);
    });
    it(title(TypeIds.Constant), async () => {
      const objs = await serialize(..._constants);
      const arr = deserialize(objs);
      expect(arr).toEqual(_constants);
    });
    it(title(TypeIds.Number), async () => {
      const objs = await serialize(123);
      const arr = deserialize(objs);
      expect(arr[0]).toBe(123);
    });
    it(title(TypeIds.String), async () => {
      const objs = await serialize('', 'hi', ['hi']);
      const arr = deserialize(objs);
      expect(arr).toEqual(['', 'hi', ['hi']]);
    });
    it(title(TypeIds.Array), async () => {
      const objs = await serialize([0, null, 'hello']);
      const arr = deserialize(objs);
      expect(arr[0]).toEqual([0, null, 'hello']);
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
      const bi = deserialize(objs)[0] as BigInt;
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
    it(title(TypeIds.Promise), async () => {
      const objs = await serialize(Promise.resolve(shared1), Promise.reject(shared1), shared1);
      const [p1, p2, shared] = deserialize(objs);
      expect(p1).resolves.toBe(shared);
      expect(p2).rejects.toBe(shared);
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
      const signal = deserialize(objs)[0] as Signal;
      expect(isSignal(signal)).toBeTruthy();
      expect(signal.value).toBe('hi');
    });
    it.todo(title(TypeIds.WrappedSignal));
    it.todo(title(TypeIds.ComputedSignal));
    // this requires a domcontainer
    it.skip(title(TypeIds.Store), async () => {
      const objs = await serialize(createStore(null, { a: { b: true } }, StoreFlags.RECURSIVE));
      const store = deserialize(objs)[0] as any;
      expect(store).toHaveProperty('a');
      expect(store.a).toHaveProperty('b', true);
    });
    it.todo(title(TypeIds.FormData));
    it.todo(title(TypeIds.JSXNode));
    it.todo(title(TypeIds.PropsProxy));
    it(title(TypeIds.EffectData), async () => {
      const objs = await serialize(new EffectData({ hi: true }));
      const effect = deserialize(objs)[0] as EffectData;
      expect(effect).toBeInstanceOf(EffectData);
      expect(effect.data).toEqual({ hi: true });
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

  describe('circular references', () => {
    it('should not detect any circular references', async () => {
      const objs = await serialize({ a: 1 });
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Object [
          String "a"
          Number 1
        ]
        (16 chars)"
      `);
    });
    it('should handle circular references', async () => {
      const obj1 = {};
      const obj2 = { obj1 };
      (obj1 as any)['self'] = obj1;
      (obj2 as any)['self'] = obj2;
      (obj1 as any)['obj2'] = obj2;

      const objs = await serialize([obj1, obj2]);
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Array [
          RootRef 2
          RootRef 1
        ]
        1 Object [
          String "obj1"
          RootRef 2
          RootRef 3
          RootRef 1
        ]
        2 Object [
          RootRef 3
          RootRef 2
          String "obj2"
          RootRef 1
        ]
        3 String "self"
        (74 chars)"
      `);
    });
    it('should scan Promise results', async () => {
      const objs = await serialize(Promise.resolve(shared1), Promise.reject(shared1));
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Promise [
          Constant true
          RootRef 2
        ]
        1 Promise [
          Constant false
          RootRef 2
        ]
        2 Object [
          String "shared"
          Number 1
        ]
        (47 chars)"
      `);
      expect(objs).toHaveLength(3 * 2);
    });
    it('should await Promises in Promises', async () => {
      const objs = await serialize(Promise.resolve({ hi: Promise.resolve(shared1) }));
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "
        0 Promise [
          Constant true
          Object [
            String "hi"
            Promise [
              Constant true
              Object [
                String "shared"
                Number 1
              ]
            ]
          ]
        ]
        (51 chars)"
      `);
    });
  });

  describe('lazy deserialization', () => {
    it('should deserialize data', async () => {
      const stateData = await serialize(0, undefined, 'hi');
      expect(stateData.every((v) => v != null)).toBeTruthy();
      const proxy = deserialize(stateData);
      expect(proxy).toEqual([0, undefined, 'hi']);
      expect(stateData).toEqual([undefined, 0, undefined, undefined, undefined, 'hi']);
    });
    it('should refer to roots', async () => {
      const stateData = await serialize(shared1, [shared1]);
      expect(stateData.every((v) => v != null)).toBeTruthy();
      const proxy = deserialize(stateData);
      const obj = proxy[0];
      expect(proxy).toEqual([obj, [obj]]);
      expect(stateData).toEqual([undefined, obj, undefined, [obj]]);
    });
  });
});

async function serialize(...roots: any[]): Promise<any[]> {
  const sCtx = createSerializationContext(null, () => '', null!);
  for (const root of roots) {
    sCtx.$addRoot$(root);
  }
  await sCtx.$breakCircularDepsAndAwaitPromises$();
  sCtx.$serialize$();
  const objs = JSON.parse(sCtx.$writer$.toString());
  // eslint-disable-next-line no-console
  DEBUG && console.log(objs);
  return objs;
}
