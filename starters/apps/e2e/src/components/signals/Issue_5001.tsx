import { component$, useStore } from "@builder.io/qwik";

export default component$(() => {
  const nakedState: [number] = [0];
  // STEP 1
  // By passing the `nakedState` into a child component, we force
  // Qwik to serialize `nakedState` into `qwik/json`
  return <Parent nakedState={nakedState} />;
});

export const Parent = component$<{ nakedState: [number] }>(({ nakedState }) => {
  // STEP 2
  // We wrap the `nakedState` into `state`.
  // This means that Qwik needs to serialize the Proxy for the `nakedState`.
  const state = useStore(nakedState);
  return (
    <>
      <Button
        // STEP 3
        // Uncommenting the next line breaks the code. (UI no longer updates)
        // This seems te be because Qwik somehow gets confused between the two
        // objects and assumes that `state` is no longer a proxy hence no
        // subscription
        //
        unusedValue={nakedState}
        state={state}
      />
      Count: <span class="count">{state[0]}</span>
    </>
  );
});

export const Button = component$<{ unusedValue?: [number]; state: [number] }>(
  ({ state }) => {
    return (
      <div>
        <button onClick$={() => state[0]++}>+1</button>
      </div>
    );
  },
);
