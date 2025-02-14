import {
  useTask$,
  component$,
  NoSerializeSymbol,
  SerializerSymbol,
  useSerializer$,
} from '@qwik.dev/core';

class NoSerSym {
  [NoSerializeSymbol] = true;
}

class SerSym {
  [SerializerSymbol]() {
    return this.toString();
  }
}

export interface Value {
  value: number;
  obj1: NoSerSym;
  obj2: SerSym;
}

export const HelloWorld = component$(() => {
  const state: Value = { value: 12, obj1: new NoSerSym(), obj2: new SerSym() };
  const ser = useSerializer$({
    deserialize: () => new SerSym(),
    serialize: (obj) => obj.toString(),
  });

  useTask$(() => {
    // eslint-disable-next-line no-console
    console.log(state.value, ser.value);
  });
  return <div></div>;
});
