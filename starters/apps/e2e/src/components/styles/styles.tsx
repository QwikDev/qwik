import { component$, useStylesScoped$, useStore } from '@builder.io/qwik';
import parent from './parent.css';
import child from './child.css';
import child2 from './child2.css';

export const Styles = component$(() => {
  useStylesScoped$(parent);
  const store = useStore({
    count: 10,
  });
  return (
    <div class="parent">
      Parent
      <button type="button" onClick$={() => store.count++}>
        Add Child
      </button>
      {Array.from({ length: store.count }).map((_, i) => (
        <Child index={i} />
      ))}
    </div>
  );
});

export const Child = component$((props: { index: number }) => {
  useStylesScoped$(child);
  useStylesScoped$(child2);

  return <div class="child">Child {props.index}</div>;
});
