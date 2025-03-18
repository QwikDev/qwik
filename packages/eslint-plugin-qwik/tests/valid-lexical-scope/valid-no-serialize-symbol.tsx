import {
  component$,
  NoSerializeSymbol,
  SerializerSymbol,
  useSerializer$,
  useSignal,
  useVisibleTask$,
} from '@qwik.dev/core';

// Instances of this class will be serialized as `undefined`
class NoSerSym {
  [NoSerializeSymbol] = true;
}

// Instances of this class will be serialized as the result of `toString()`
class SerSym {
  constructor(public value: string) {
    // do something with the value
  }
  [SerializerSymbol]() {
    return this.toString();
  }
}

export interface Value {
  value: number;
  obj1: NoSerSym;
  obj2: SerSym;
}

class Obj1 {
  constructor(public value: string) {}
  toString() {
    return this.value;
  }
}
const makeObj1 = (s: string) => new Obj1(s);

class Obj2 {
  constructor(public value: number) {}
  toString() {
    return this.value;
  }
}
const makeObj2 = (n: number) => new Obj2(n);

export const HelloWorld = component$(() => {
  // Will be serialized as `{value: 12, obj1: undefined, obj2: 'hello'}`
  const state: Value = { value: 12, obj1: new NoSerSym(), obj2: new SerSym('hello') };
  const ser1 = useSerializer$({
    deserialize: (data: string) => makeObj1(data),
    serialize: (obj) => obj.toString(),
    initial: 'hi',
  });
  const sig = useSignal(123);
  const ser2 = useSerializer$(() => ({
    deserialize: () => makeObj2(sig.value),
    update: (obj) => {
      // when the signal changes, update the object
      obj.value = sig.value;
      // return the updated object so the listeners are notified
      return obj;
    },
    // we only need the signal, so we don't need to serialize anything
    // Not specifying the serialize method is the same as returning `undefined`
  }));

  useVisibleTask$(() => {
    // eslint-disable-next-line no-console
    console.log('serialized', state, ser1.value, ser2.value);
  });

  return null;
});
