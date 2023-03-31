import { component$, useSignal, useTask$ } from '@builder.io/qwik';

export default component$(() => {
  const fibonacci = useSignal<number[]>();

  useTask$(async () => {
    const size = 40;
    const array = [];
    array.push(0, 1);
    for (let i = array.length; i < size; i++) {
      array.push(array[i - 1] + array[i - 2]);
      await delay(100);
    }
    fibonacci.value = array;
  });

  return <div>{fibonacci.value?.join(', ')}</div>;
});

const delay = (time: number) => new Promise((resolve) => setTimeout(resolve, time));
