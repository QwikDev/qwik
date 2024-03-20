import { describe, it, expect } from 'vitest';
import { SerializationConstant, createSerializationContext } from './shared-serialization';
import { Task } from '../../use/use-task';
import { inlinedQrl } from '../../qrl/qrl';

const DEBUG = false;

describe('shared-serialization', () => {
  it('should not detect any circular references', async () => {
    const objs = await serializeDeserialize({ a: 1 });
    expect(objs.length).toBe(1);
  });

  describe('circular references', () => {
    const shared1 = { shared: 1 };
    const shared2 = { shared: 2 };
    it('should detect objects', async () => {
      const objs = await serializeDeserialize({ foo: shared1 }, { bar: shared1 });
      expect(objs.length).toBe(3);
      expect(objs[0]).toEqual({ foo: SerializationConstant.REFERENCE_CHAR + '2' });
      expect(objs[1]).toEqual({ bar: SerializationConstant.REFERENCE_CHAR + '2' });
      expect(objs[2]).toEqual(shared1);
    });
    it('should detect Set', async () => {
      const objs = await serializeDeserialize(new Set([shared1, [shared1]]));
      expect(objs.length).toBe(3);
      expect(objs).toEqual([
        SerializationConstant.Set_CHAR + 1,
        [SerializationConstant.REFERENCE_CHAR + 2, [SerializationConstant.REFERENCE_CHAR + 2]],
        shared1,
      ]);
    });
    it('should detect Map', async () => {
      const objs = await serializeDeserialize(
        new Map([
          ['foo', shared1],
          ['bar', shared1],
        ])
      );
      expect(objs).toEqual([
        SerializationConstant.Map_CHAR + 1,
        [
          'foo',
          SerializationConstant.REFERENCE_CHAR + 2,
          'bar',
          SerializationConstant.REFERENCE_CHAR + 2,
        ],
        shared1,
      ]);
    });
    it('should detect Task', async () => {
      const qrl = inlinedQrl(0, 's_zero') as any;
      const objs = await serializeDeserialize(
        new Task(0, 0, shared1 as any, qrl, shared2 as any, null)
      );
      expect(objs).toEqual([
        SerializationConstant.Task_CHAR + '0 0 1 qwik-runtime-mock-chunk#s_zero 2',
        shared1,
        shared2,
      ]);
    });
  });
});

async function serializeDeserialize(...roots: any[]): Promise<any[]> {
  const sCtx = createSerializationContext(null, new WeakMap(), () => '');
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
