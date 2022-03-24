import { useStore, $, component$, Host } from '@builder.io/qwik';

export function delay(time: number) {
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(), time);
  });
}

export const Async = component$(() => {
  const state = useStore({ name: 'World', count: 0 });
  return $(() => (
    <Host class="my-app p-20">
      <button
        class="border-2 border-solid border-blue-500"
        onClick$={() => {
          state.count++;
        }}
      >
        More
      </button>
      <Inner value={state.count} />
    </Host>
  ));
});

// This code will not work because its async before reading subs
export const Inner = component$((props: { value: number }) => {
  return $(async () => {
    await delay(1000);
    return (
      <Host class="my-app p-20">
        {props.value}
        <Inner2 {...props} />
      </Host>
    );
  });
});

export const Inner2 = component$((props: { value: number }) => {
  return $(async () => {
    await delay(1000);
    return <Host class="my-app p-20">{props.value}</Host>;
  });
});
