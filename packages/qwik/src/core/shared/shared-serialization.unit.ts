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
import { isQrl } from './qrl/qrl-class';
import { EMPTY_ARRAY, EMPTY_OBJ } from './utils/flyweight';
import { createComputed$, createSignal } from '../signal/signal.public';
import { _fnSignal, _wrapProp } from '../internal';

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
        "0 Array 
          0 RootRef 1
          1 RootRef 1
        1 Object 
          0 String "shared"
          1 Number 1"
      `);
    });
    it(title(TypeIds.Constant), async () => {
      expect(await dump(..._constants)).toMatchInlineSnapshot(`
        "0 Constant undefined
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
        12 Constant -Infinity"
      `);
    });
    it(title(TypeIds.Number), async () => {
      expect(await dump(123)).toMatchInlineSnapshot(`
        "0 Number 123"
      `);
    });
    it(title(TypeIds.String), async () => {
      expect(await dump('hi')).toMatchInlineSnapshot(`
        "0 String "hi""
      `);
    });
    it(title(TypeIds.Array), async () => {
      expect(await dump([0, null, 'hello'])).toMatchInlineSnapshot(`
        "0 Array 
          0 Number 0
          1 Constant null
          2 String "hello""
      `);
    });
    it(title(TypeIds.URL), async () => {
      expect(await dump(new URL('http://example.com:80/'))).toMatchInlineSnapshot(`
        "0 URL "http://example.com/""
      `);
    });
    it(title(TypeIds.Date), async () => {
      expect(await dump(new Date('2020-01-02T12:34'))).toMatchInlineSnapshot(`
        "0 Date "2020-01-02T11:34:00.000Z""
      `);
    });
    it(title(TypeIds.Regex), async () => {
      expect(await dump(/abc/gm)).toMatchInlineSnapshot(`
        "0 Regex "/abc/gm""
      `);
    });
    // TODO how to make a vnode?
    it.todo(title(TypeIds.VNode));
    it(title(TypeIds.BigInt), async () => {
      expect(await dump(BigInt('12345678901234567890'))).toMatchInlineSnapshot(
        `"0 BigInt "12345678901234567890""`
      );
    });
    it(title(TypeIds.URLSearchParams), async () => {
      expect(await dump(new URLSearchParams({ a: '', b: '12' }))).toMatchInlineSnapshot(
        `"0 URLSearchParams "a=&b=12""`
      );
    });
    it(title(TypeIds.Error), async () => {
      const err = new Error('hi');
      err.stack = err
        .stack!.replaceAll(/\/.*\./g, '/...path/file.')
        .replaceAll(/:\d+:\d+/g, ':123:456');
      expect(await dump(err)).toMatchInlineSnapshot(`
        "0 Error 
          0 String "hi"
          1 String "Error: hi\\n    at /...path/file.ts:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\"..."
      `);
      (err as any).extra = 'yey';
      expect(await dump(err)).toMatchInlineSnapshot(`
        "0 Error 
          0 String "hi"
          1 Array 
            0 String "extra"
            1 String "yey"
          2 String "Error: hi\\n    at /...path/file.ts:123:456\\n    at file:/...path/file.js:123:456\\n    at file:/...path/file.js:123:456\\"..."
      `);
    });
    it(title(TypeIds.Object), async () => {
      const objs = await serialize({ foo: shared1 }, { bar: shared1, shared: true });
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 Object 
          0 String "foo"
          1 RootRef 3
        1 Object 
          0 String "bar"
          1 RootRef 3
          2 RootRef 2
          3 Constant true
        2 String "shared"
        3 Object 
          0 RootRef 2
          1 Number 1"
      `);
      expect(objs).toHaveLength(4 * 2);
    });
    it(title(TypeIds.Promise), async () => {
      expect(await dump(Promise.resolve(shared1), Promise.reject(shared2))).toMatchInlineSnapshot(`
        "0 Promise 
          0 Constant true
          1 Object 
            0 RootRef 2
            1 Number 1
        1 Promise 
          0 Constant false
          1 Object 
            0 RootRef 2
            1 Number 2
        2 String "shared""
      `);
    });
    it(title(TypeIds.Set), async () => {
      const objs = await serialize(new Set([shared1, [shared1]]));
      expect(dumpState(objs)).toMatchInlineSnapshot(
        `
        "0 Set 
          0 RootRef 1
          1 Array 
            0 RootRef 1
        1 Object 
          0 String "shared"
          1 Number 1"
      `
      );
    });
    it('Map', async () => {
      const objs = await serialize(
        new Map<any, any>([
          ['shared', shared1],
          [shared2, shared1],
        ])
      );
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 Map 
          0 RootRef 1
          1 RootRef 2
          2 Object 
            0 RootRef 1
            1 Number 2
          3 RootRef 2
        1 String "shared"
        2 Object 
          0 RootRef 1
          1 Number 1"
      `);
    });
    it('Task', async () => {
      const qrl = inlinedQrl(0, 's_zero') as any;
      const objs = await serialize(new Task(0, 0, shared1 as any, qrl, shared2 as any, null));
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 Task 
          0 QRL "mock-chunk#s_zero"
          1 Number 0
          2 Number 0
          3 Object 
            0 RootRef 1
            1 Number 1
          4 Constant null
          5 Object 
            0 RootRef 1
            1 Number 2
        1 String "shared""
      `);
    });
    it('Signal', async () => {
      const objs = await serialize({ foo: createSignal('hi') });
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 Object 
          0 String "foo"
          1 Signal 
            0 String "hi""
      `);
    });
    it('WrappedSignal', async () => {
      const objs = await serialize(
        _fnSignal((p0) => p0 + 1, [3], '(p0)=>p0+1'),
        _wrapProp({})
      );
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 WrappedSignal 
          0 Number 0
          1 Array 
            0 Number 3
          2 Constant null
          3 Number 4
        1 WrappedSignal 
          0 Number 1
          1 Array 
            0 Object 

            1 String "value"
          2 Constant null
          3 Constant undefined"
      `);
    });
    it('ComputedSignal (invalid)', async () => {
      const foo = createSignal(1);
      const bar = createComputed$(() => foo.value + 1);
      const objs = await serialize(bar);
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 ComputedSignal 
          0 QRL "mock-chunk#describe_describe_it_bar_createComputed_nhM04JtK52Y[1]"
          1 Constant NEEDS_COMPUTATION
          2 Constant true
        1 Signal 
          0 Number 1"
      `);
    });
    it('ComputedSignal (clean)', async () => {
      const foo = createSignal(1);
      const bar = createComputed$(() => foo.value + 1);
      // note that this won't subscribe because we're not setting up the context
      expect(bar.value).toBe(2);
      const objs = await serialize(bar);
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 ComputedSignal 
          0 QRL "mock-chunk#describe_describe_it_bar_createComputed_1_a0LpZ0PQgJs[1]"
          1 Number 2
          2 Constant false
        1 Signal 
          0 Number 1"
      `);
    });
  });

  const deserialize = (data: unknown[]) => {
    const container = _createDeserializeContainer(data);
    return container.$state$!;
  };

  describe('deserialize types', () => {
    it(title(TypeIds.Constant), async () => {
      const objs = await serialize(..._constants);
      const arr = deserialize(objs);
      expect(arr).toEqual(_constants);
    });
    it('objects', async () => {
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
    it('Set', async () => {
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
    it('Map', async () => {
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
    it('Task', async () => {
      const qrl = inlinedQrl(0, 's_zero') as any;
      const objs = await serialize(new Task(0, 0, shared1 as any, qrl, shared2 as any, null));
      const [task] = deserialize(objs) as Task[];
      expect(task.$qrl$.$symbol$).toEqual(qrl.$symbol$);
      expect(task.$el$).toEqual(shared1);
      expect(task.$state$).toEqual(shared2);
    });
  });

  describe('circular references', () => {
    it('should not detect any circular references', async () => {
      const objs = await serialize({ a: 1 });
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 Object 
          0 String "a"
          1 Number 1"
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
        "0 Array 
          0 RootRef 2
          1 RootRef 1
        1 Object 
          0 String "obj1"
          1 RootRef 2
          2 RootRef 3
          3 RootRef 1
        2 Object 
          0 RootRef 3
          1 RootRef 2
          2 String "obj2"
          3 RootRef 1
        3 String "self""
      `);
    });
    it('should scan Promise results', async () => {
      const objs = await serialize(Promise.resolve(shared1), Promise.reject(shared1));
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 Promise 
          0 Constant true
          1 RootRef 2
        1 Promise 
          0 Constant false
          1 RootRef 2
        2 Object 
          0 String "shared"
          1 Number 1"
      `);
      expect(objs).toHaveLength(3 * 2);
    });
    it('should await Promises in Promises', async () => {
      const objs = await serialize(Promise.resolve({ hi: Promise.resolve(shared1) }));
      expect(dumpState(objs)).toMatchInlineSnapshot(`
        "0 Promise 
          0 Constant true
          1 Object 
            0 String "hi"
            1 Promise 
              0 Constant true
              1 Object 
                0 String "shared"
                1 Number 1"
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

  describe('server side serialization', () => {
    it('should serialize data', async () => {
      const serializedData = await _serialize([
        inlinedQrl(0, 'Root_component_arKLnchfR8k'),
        undefined,
        new URL('http://example.com'),
      ]);

      expect(dumpState(JSON.parse(serializedData))).toMatchInlineSnapshot(`
        "0 QRL "mock-chunk#Root_component_arKLnchfR8k"
        1 Constant undefined
        2 URL "http://example.com/""
      `);
    });

    it('should serialize nested data', async () => {
      const serializedData = await _serialize([
        { foo: new URL('http://example.com'), bar: [undefined] },
      ]);

      expect(dumpState(JSON.parse(serializedData))).toMatchInlineSnapshot(`
        "0 Object 
          0 String "foo"
          1 URL "http://example.com/"
          2 String "bar"
          3 Array 
            0 Constant undefined"
      `);
    });
  });

  describe('server side deserialization', () => {
    it('works for simple cases', () => {
      const stateData = JSON.stringify([
        TypeIds.Constant,
        0,
        TypeIds.URL,
        'http://example.com:80/',
        TypeIds.Date,
        '2020-01-02T12:34',
      ]);
      expect(_deserialize(stateData)).toMatchInlineSnapshot(`
        [
          undefined,
          "http://example.com/",
          2020-01-02T11:34:00.000Z,
        ]
      `);
    });
    it('object', async () => {
      const obj = { foo: { foo: new URL('http://example.com') } };
      const stateData = await _serialize([obj]);
      const deserializedData = _deserialize(stateData) as unknown[];
      expect(deserializedData[0]).toEqual(obj);
    });
    it('should deserialize data', async () => {
      const stateData = await _serialize([
        inlinedQrl(0, 'Root_component_arKLnchfR8k'),
        undefined,
        new URL('http://example.com'),
      ]);
      expect(dumpState(JSON.parse(stateData))).toMatchInlineSnapshot(`
        "0 QRL "mock-chunk#Root_component_arKLnchfR8k"
        1 Constant undefined
        2 URL "http://example.com/""
      `);
      const deserializedData = _deserialize(stateData) as unknown[];
      expect(isQrl(deserializedData[0])).toBeTruthy();
      expect(deserializedData[1]).toBeUndefined();
      expect(deserializedData[2] instanceof URL).toBeTruthy();
    });

    it('should deserialize nested data', async () => {
      const stateData = JSON.stringify([
        TypeIds.Object,
        [
          TypeIds.RootRef,
          1,
          TypeIds.URL,
          'http://example.com:80/',
          TypeIds.RootRef,
          2,
          TypeIds.String,
          'abcd',
        ],
        TypeIds.String,
        'foo',
        TypeIds.String,
        'bar',
      ]);
      const [deserializedData] = _deserialize(stateData) as any[];
      expect(deserializedData).toMatchInlineSnapshot(`
        {
          "bar": "abcd",
          "foo": "http://example.com/",
        }
      `);
      expect(deserializedData.foo instanceof URL).toBeTruthy();
      expect(deserializedData.bar).toEqual('abcd');
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
