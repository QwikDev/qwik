import { $, component$, useSignal, _jsxSorted } from '@qwik.dev/core';

export const App = component$(() => {
  const count = useSignal(0);
  const View = $(() => <span>{count.value}</span>);
  const getter = $(() => count.value);
  const click = $(() => count.value++);
  return (
    <>
      <button onClick$={click}>event only</button>
      <button onClick$={View}>also a tag</button>
      <View />
      {_jsxSorted(
        'button',
        null,
        {
          get 'q-e:click'() {
            getter();
            return getter;
          },
        },
        'getter',
        3,
        null
      )}
    </>
  );
});
