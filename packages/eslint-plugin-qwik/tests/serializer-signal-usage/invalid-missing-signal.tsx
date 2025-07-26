// @typescript-eslint/parser
// Expect error: { "messageId": "serializerSignalMismatch" }
import { component$, useSignal, useSerializer$ } from '@qwik.dev/core';

class MyClass {
  constructor(
    public count: number,
    public name: string
  ) {}
}

export default component$(() => {
  const countSignal = useSignal(0);
  const nameSignal = useSignal('John');

  const out = useSerializer$(() => ({
    deserialize: () => {
      return new MyClass(countSignal.value, 'Fred');
    },
    update: (myClass) => {
      myClass.count++; // countSignal not used here
      myClass.name = nameSignal.value; // nameSignal used here but not in deserialize
      return myClass;
    },
  }));

  return (
    <div>
      {out.value.count} {out.value.name}
    </div>
  );
});
