import { $, component$, onRender$, createStore, withStyles$ } from '@builder.io/qwik';
import styles from './app.css';

export const App = component$(() => {
  withStyles$(styles);

  const store1 = createStore({ count: 1 });
  const store2 = createStore({ count: 1 });
  return onRender$(() => (
    <button class="two-listeners" on:click={[$(() => store1.count++), $(() => store2.count++)]}>
      {store1.count} / {store2.count}
    </button>
  ));
});
