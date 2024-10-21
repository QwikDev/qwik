import { component$, useTask$, useSignal } from '@qwik.dev/core';
enum Color {
  Red,
  Blue,
  Green,
}

export default component$(() => {
  const color = useSignal<{ color: Color }>({ color: Color.Red });

  useTask$(() => {
    color.value.color = Color.Blue;
  });
  return <></>;
});
