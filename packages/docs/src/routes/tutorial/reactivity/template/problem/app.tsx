/* eslint-disable no-console */
import { component$, useStore } from '@builder.io/qwik';

interface AppStore {
  countA: number;
  countB: number;
}
export default component$(() => {
  const store = useStore<AppStore>({
    countA: 0,
    countB: 0,
  });
  console.log('Render: <App>');
  return (
    <>
      <button onClick$={() => null}>a++</button>
      <DisplayA store={store} />
      <hr />
      <button onClick$={() => null}>b++</button>
      <DisplayB store={store} />
    </>
  );
});

export const DisplayA = component$<{ store: AppStore }>((props) => {
  console.log('Render: <DisplayA>');
  return <>{props.store.countA}</>;
});

export const DisplayB = component$<{ store: AppStore }>((props) => {
  console.log('Render: <DisplayB>');
  return <>{props.store.countB}</>;
});
