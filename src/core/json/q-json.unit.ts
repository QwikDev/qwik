import { getQObjectId } from '../object/q-object';
import type { QObjectMap } from '../props/q-props-obj-map';
import { useStore } from '../use/use-state.public';
import { qJsonParse, qJsonStringify, ATTR_OBJ_PREFIX } from './q-json';

describe('qjson', () => {
  let map: QObjectMap;
  beforeEach(() => (map = new Map<string, any>() as any));

  describe('qJsonStringify', () => {
    it('should serialize basic types', () => {
      expect(qJsonStringify(undefined, map)).toEqual('undefined');
      expect(qJsonStringify('undefined', map)).toEqual("'undefined'");
      expect(qJsonStringify(null, map)).toEqual('null');
      expect(qJsonStringify('null', map)).toEqual("'null'");
      expect(qJsonStringify(true, map)).toEqual('true');
      expect(qJsonStringify('true', map)).toEqual("'true'");
      expect(qJsonStringify(false, map)).toEqual('false');
      expect(qJsonStringify('false', map)).toEqual("'false'");
      expect(qJsonStringify('text"\'`\\', map)).toEqual("'text\"\\'`\\'");
      expect(qJsonStringify(0, map)).toEqual('0');
      expect(qJsonStringify(123, map)).toEqual('123');
      expect(qJsonStringify(-432, map)).toEqual('-432');
      expect(qJsonStringify(-432.1, map)).toEqual('-432.1');
      expect(qJsonStringify('0', map)).toEqual("'0'");
      expect(qJsonStringify('123', map)).toEqual("'123'");
      expect(qJsonStringify('-432', map)).toEqual("'-432'");
      expect(qJsonStringify('-432.1', map)).toEqual("'-432.1'");
    });

    it('should serialize QObject', () => {
      const obj = useStore({ salutation: 'Hello', name: 'World' });
      const id = getQObjectId(obj)!;
      expect(qJsonStringify(obj, map)).toEqual(ATTR_OBJ_PREFIX + id);
      expect(map.get(id)).toBe(obj);
    });
  });

  describe('qjsonParse', () => {
    it('should serialize basic types', () => {
      expect(qJsonParse('undefined', map)).toEqual(undefined);
      expect(qJsonParse('null', map)).toEqual(null);
      expect(qJsonParse('true', map)).toEqual(true);
      expect(qJsonParse('false', map)).toEqual(false);
      expect(qJsonParse('0', map)).toEqual(0);
      expect(qJsonParse('123', map)).toEqual(123);
      expect(qJsonParse('-432', map)).toEqual(-432);
      expect(qJsonParse('-432.1', map)).toEqual(-432.1);
      expect(qJsonParse('abc', map)).toEqual('abc');
      expect(qJsonParse("'abc'", map)).toEqual('abc');
      expect(qJsonParse("'abc'", map)).toEqual('abc');
    });

    it('should retrieve QObject', () => {
      const obj = useStore({ salutation: 'Hello', name: 'World' });
      const id = getQObjectId(obj)!;
      map.set(id, obj);
      expect(qJsonParse(ATTR_OBJ_PREFIX + id, map)).toEqual(obj);
    });

    it('should retrieve JSON', () => {
      const obj = useStore({ salutation: 'Hello', name: 'World' });
      const val = { obj: obj };
      const json = qJsonStringify(val, map);

      expect(qJsonParse(json, map)).not.toBe(val);
      expect(qJsonParse(json, map)).toEqual(val);
    });
  });
});

///////////////////////////
