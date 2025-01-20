import { component$, useSignal } from "@builder.io/qwik";
export default component$(() => {
  const a = useSignal(1);
  const b = useSignal(2);

  return (
    <div>
      {a.value} + {b.value} = <span id="result">{a.value + b.value}</span>
      <input type="number" id="input1" bind:value={a} />
      <input type="number" id="input2" bind:value={b} />
    </div>
  );
});
