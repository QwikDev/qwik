import { component$, useStore } from '@builder.io/qwik';

export const ExampleTest = component$((props: { flag: boolean }) => {
  const state = useStore({
    counter: 0,
  });

  return (
    <>
      <span>Count:{state.counter}</span>
      <div class="icon">Flag: {props.flag ? '⭐' : '💣'}</div>
      <button class="btn-counter" onClick$={() => state.counter++}>
        Increment counter
      </button>
    </>
  );
});
