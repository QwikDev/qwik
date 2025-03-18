import { component$, useSignal, useSerializer$ } from '@qwik.dev/core';

class MyClass {
  constructor(public count: number) {}
}

export default component$(() => {
  const countSignal = useSignal(0);

  const out = useSerializer$(() => ({
    deserialize: () => {
      return new MyClass(countSignal.value);
    },
    update: (myClass) => {
      myClass.count = countSignal.value;
      return myClass;
    },
  }));

  return <div>{out.value.count}</div>;
});
