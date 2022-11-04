import { component$, useStore } from '@builder.io/qwik';

export const ExampleTest = component$((props: { flag: boolean }) => {
  const state = useStore({
    counter: 0,
  });

  return (
    <>
      <span>Contador:{state.counter}</span>
      <div class="icon">Hola: {props.flag ? '⭐' : '💣'}</div>
      <button className="btn-counter" onClick$={() => state.counter++}>
        Btn1
      </button>
    </>
  );
});
