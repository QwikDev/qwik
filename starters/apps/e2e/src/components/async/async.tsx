import { useStore, component$ } from "@builder.io/qwik";

export function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), time);
  });
}

export const Async = component$(() => {
  const state = useStore({ name: "World", count: 0 });
  async function stuff() {
    await delay(10);
    return (
      <>
        <button
          class="border-2 border-solid border-blue-500"
          onClick$={() => {
            state.count++;
          }}
        >
          More
        </button>
      </>
    );
  }

  return (
    <div class="my-app p-20">
      {stuff()}
      <Inner value={state.count} />
    </div>
  );
});

// This code will not work because its async before reading subs
export const Inner = component$((props: { value: number }) => {
  async function resolve() {
    await delay(1000);
    return (
      <>
        <Inner2 value={props.value} />
      </>
    );
  }
  return (
    <div class="my-app p-20">
      Inner: {props.value}
      {resolve()}
    </div>
  );
});

export const Inner2 = component$((props: { value: number }) => {
  const value = props.value;
  return <div class="my-app p-20">Inner2: {delay(1000).then(() => value)}</div>;
});
