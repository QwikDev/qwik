import { component$, PropFunction, Slot, useStore } from '@builder.io/qwik';

export const App = component$(() => {
  const store = useStore({ count: 0 });
  return (
    <MyButton
      onClick$={async () => {
        store.count++;
      }}
    >
      {store.count}
    </MyButton>
  );
});

interface MyButtonProps {
  onClick$: PropFunction<() => void>;
}
export const MyButton = component$((props: MyButtonProps) => {
  return (
    <button onClick$={props.onClick$} style={{}}>
      <Slot />
    </button>
  );
});
