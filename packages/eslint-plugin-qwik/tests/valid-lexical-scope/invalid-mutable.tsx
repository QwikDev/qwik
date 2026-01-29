// Expect error: { "messageId": "mutableIdentifier" }
import { component$, $, useSignal } from '@builder.io/qwik';

export const HelloWorld = component$(() => {
  let startX: number | undefined = 0;
  const divRef = useSignal<{ offsetLeft: number }>();

  const handleMouseDown = $((e: MouseEvent) => {
    // eslint-disable-next-line no-console
    console.log('working');
    startX = e.pageX - divRef.value!.offsetLeft;
  });
  return <div onMouseDown$={handleMouseDown}></div>;
});
