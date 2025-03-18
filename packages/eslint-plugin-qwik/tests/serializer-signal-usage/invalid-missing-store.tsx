// Expect error: { "messageId": "serializerSignalMismatch" }
import { component$, useStore, useSerializer$ } from '@qwik.dev/core';

class MyClass {
  constructor(
    public count: number,
    public name: string
  ) {}
}

export default component$(() => {
  const store = useStore({ count: 0, name: 'John' });

  const out = useSerializer$(() => ({
    deserialize: () => {
      return new MyClass(store.count, store.name);
    },
    update: (myClass) => {
      myClass.count++; // store.count not used here
      myClass.name = store.name;
      return myClass;
    },
  }));

  return (
    <div>
      {out.value.count} {out.value.name}
    </div>
  );
});
