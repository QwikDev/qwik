import {
  component$,
  useComputed$,
  useContext,
  useSignal,
  useTask$,
} from "@qwik.dev/core";
import { childContext } from "./counter4-child";

export default component$(() => {
  const doubleCount = useContext(childContext);
  const quadrupleCount = useSignal(0);
  useTask$(({ track }) => {
    track(() => doubleCount.value);
    quadrupleCount.value = doubleCount.value * 2;
  });

  useTask$(({ track }) => {
    track(() => quadrupleCount.value);
    console.log("quadrupleCount", quadrupleCount.value);
  });

  const heightupleCount = useComputed$(() => doubleCount.value * 4);

  return (
    <>
      <p style={{ background: quadrupleCount.value === 0 ? "blue" : "red" }}>
        QUADRUPLE COUNT: {quadrupleCount.value}
      </p>
      <p style={{ background: heightupleCount.value === 0 ? "blue" : "red" }}>
        HEIGHTULE COUNT: {heightupleCount.value}
      </p>
    </>
  );
});
