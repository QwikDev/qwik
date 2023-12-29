import { SerializationConstant } from '../shared-types';

const objMap = new WeakMap<any, any>();

export function deserialize<T>(roots: any[], value: any): any {
  if (typeof value === 'object' && value !== null) {
    let proxy = objMap.get(value);
    if (!proxy) {
      proxy = new Proxy(value, {
        get(target, p, receiver) {
          return deserialize(roots, Reflect.get(target, p, receiver));
        },
      });
      objMap.set(value, proxy);
    }
    return proxy;
  } else if (typeof value === 'string' && value.length) {
    const code = value.charCodeAt(0);
    if (code === SerializationConstant.UNDEFINED_VALUE) {
      return undefined;
    } else if (code === SerializationConstant.REFERENCE_VALUE) {
      // 0x10 is a special code for a reference to an object.
      // The reference is encoded as a number.
      const ref = parseInt(value.substring(1));
      return deserialize(roots, roots[ref]);
    }
    return value;
  }
  return value;
}
