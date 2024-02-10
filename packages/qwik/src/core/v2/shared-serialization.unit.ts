import { describe, it, expect } from 'vitest';
import {
  SerializationConstant,
  createSerializationContext,
  serialize,
} from './shared-serialization';
import { Task } from '../use/use-task';
import { inlinedQrl } from '../qrl/qrl';

const DEBUG = false;

describe('shared-serialization', () => {
  it('should not detect any circular references', () => {
    const objs = serializeDeserialize({ a: 1 });
    expect(objs.length).toBe(1);
  });

  describe('circular references', () => {
    const shared1 = { shared: 1 };
    const shared2 = { shared: 2 };
    it('should detect objects', () => {
      const objs = serializeDeserialize({ foo: shared1 }, { bar: shared1 });
      expect(objs.length).toBe(3);
      expect(objs[0]).toEqual({ foo: SerializationConstant.REFERENCE_CHAR + '2' });
      expect(objs[1]).toEqual({ bar: SerializationConstant.REFERENCE_CHAR + '2' });
      expect(objs[2]).toEqual(shared1);
    });
    it('should detect Set', () => {
      const objs = serializeDeserialize(new Set([shared1, [shared1]]));
      expect(objs.length).toBe(3);
      expect(objs).toEqual([
        SerializationConstant.Set_CHAR + 1,
        [SerializationConstant.REFERENCE_CHAR + 2, [SerializationConstant.REFERENCE_CHAR + 2]],
        shared1,
      ]);
    });
    it('should detect Map', () => {
      const objs = serializeDeserialize(
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
    it('should detect Task', () => {
      const qrl = inlinedQrl(0, 's_zero') as any;
      const objs = serializeDeserialize(new Task(0, 0, shared1 as any, qrl, shared2 as any));
      expect(objs).toEqual([
        SerializationConstant.Task_CHAR + '0 0 1 qwik-runtime-mock-chunk#s_zero 2',
        shared1,
        shared2,
      ]);
    });
  });
});

function serializeDeserialize(...roots: any[]): any[] {
  const sCtx = createSerializationContext(null, null, new WeakMap());
  for (const root of roots) {
    sCtx.$addRoot$(root);
  }
  serialize(sCtx);
  const objs = JSON.parse(sCtx.$writer$.toString());
  DEBUG && console.log(objs);
  return objs;
}
