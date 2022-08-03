import { component$, Host, useScopedStyles$, useStore } from '@builder.io/qwik';
import parent from './parent.css';
import child from './child.css';
import child2 from './child2.css';

export const Styles = component$(() => {
  useScopedStyles$(parent);
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
  useScopedStyles$(child);
  useScopedStyles$(child2);

  return <Host class="child">Child</Host>;
});
