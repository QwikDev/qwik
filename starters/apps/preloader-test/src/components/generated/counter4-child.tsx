import {
  component$,
  createContextId,
  useAsyncComputed$,
  useComputed$,
  useContext,
  useContextProvider,
  useSignal,
  useTask$,
  type Signal,
} from "@qwik.dev/core";
import { CounterContext } from "./counter4";
import Counter4Grandchild from "./counter4-grandchild";

export const childContext = createContextId<Signal<number>>("child");

export default component$(() => {
  const count = useContext(CounterContext);
  const doubleCount = useSignal(0);

  const privateCount = useSignal(0);
  useTask$(({ track }) => {
    track(() => count.value);
    doubleCount.value = count.value * 2;
  });

  useContextProvider(childContext, doubleCount);

  return (
    <>
      <p style={{ background: count.value === 0 ? "blue" : "red" }}>
        DOUBLE COUNT: {doubleCount.value}
      </p>
      <p
        style={{ background: privateCount.value === 0 ? "blue" : "red" }}
        onClick$={() => {
          privateCount.value++;
        }}
      >
        PRIVATE COUNT: {privateCount.value}
      </p>
      <Counter4Grandchild />
    </>
  );
});
