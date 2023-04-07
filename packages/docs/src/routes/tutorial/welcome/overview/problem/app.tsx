import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  return (
    <>
      <h1>Hello World!</h1>
      I am a static component, there is no reason to ever download me to the client.
      <br />
      <button onClick$={() => alert('Hello')}>greet!</button>
      <hr />
      <Counter />
    </>
  );
});

export const Counter = component$(() => {
  const store = useStore({ count: 0 });
  return (
    <>
      I am a dynamic component. Qwik will download me only when it is time to re-render me after the
      user clicks on the <code>+1</code> button.
      <br />
      Current count: {store.count}
      <br />
      <button onClick$={() => store.count++}>+1</button>
    </>
  );
});
