import { component$, Host, useStore, useStyles$ } from '@builder.io/qwik';
import parent from './parent.css';
import child from './child.css';
import child2 from './child2.css';

export const Styles = component$(() => {
  useStyles$(parent);
  const store = useStore({
    count: 10,
  });
  return (
    <Host class="parent">
      Parent
      <button type="button" onClick$={() => store.count++}>
        Add Child
      </button>
      {Array.from({ length: store.count }).map(() => (
        <Child />
      ))}
    </Host>
  );
});

export const Child = component$(() => {
  useStyles$(child);
  useStyles$(child2);

  return <Host class="child">Child</Host>;
});
