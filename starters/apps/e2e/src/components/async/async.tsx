import { useStore, component$, Host, mutable } from '@builder.io/qwik';

export function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), time);
  });
}

export const Async = component$(() => {
  const state = useStore({ name: 'World', count: 0 });
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
    <Host class="my-app p-20">
      {stuff()}
      <Inner value={mutable(state.count)} />
    </Host>
  );
});

// This code will not work because its async before reading subs
export const Inner = component$((props: { value: number }) => {
  async function resolve() {
    await delay(1000);
    return (
      <>
        <Inner2 value={mutable(props.value)} />
      </>
    );
  }
  return (
    <Host class="my-app p-20">
      Inner: {props.value}
      {resolve()}
    </Host>
  );
});

export const Inner2 = component$((props: { value: number }) => {
  const value = props.value;
  return <Host class="my-app p-20">Inner2: {delay(1000).then(() => value)}</Host>;
});
