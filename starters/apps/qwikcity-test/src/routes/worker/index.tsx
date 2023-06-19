
import { component$ } from '@builder.io/qwik';
import { worker$ } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <button onClick$={worker$(() => {
      console.log('worker');
    })}>Worker</button>
  )

});