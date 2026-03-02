import {
  component$,
  createContextId,
  useContext,
  useContextProvider,
  useSignal,
  useTask$,
  type Signal,
} from "@qwik.dev/core";
import Counter4Child from "./counter4-child";

export const CounterContext = createContextId<Signal<number>>("counter4");
export default component$(() => {
  const count = useSignal(0);

  useTask$(({ track }) => {
    track(() => count.value);
  });

  useContextProvider(CounterContext, count);

  return (
    <>
      <button
        onClick$={() => {
          count.value++;
        }}
      >
        Increment
      </button>
      <p style={{ background: count.value === 0 ? "blue" : "red" }}>
        Current Count: {count.value}
      </p>
      <Counter4Child />
    </>
  );
});
