/* eslint-disable no-console */
import { component$, useStore } from '@builder.io/qwik';

interface CountStore {
  count: number;
}
export default component$(() => {
  const store = useStore<CountStore>({ count: 0 });
  console.log('Render: <App/>');
  return (
    <>
      <code>&lt;App&gt;</code>
      This component is static! After initial rendering as part of SSR, it will never rerender on
      the client. This means that it will also never load an the client. The component is
      tree-shaken on the client.
      <br />
      Click <button onClick$={() => store.count++}>+1</button> to observe what code Qwik loads as a
      result of modifying the application state.
      <Child store={store} />
    </>
  );
});

export const Child = component$((props: { store: CountStore }) => {
  console.log('Render: <Child/>');
  return (
    <>
      <code>&lt;Child&gt;</code>
      This component is dynamic because it is bound to <code>props.store.count</code>
      {/* Commented out the binding to demonstrate the effect on code downloaded to the client! */}
      {/* props.store.count */}
      <GrandChild store={props.store} />
    </>
  );
});

export const GrandChild = component$((props: { store: CountStore }) => {
  console.log('Render: <GroundChild/>');
  return (
    <>
      <code>&lt;GrandChild&lt;</code>
      This component is also dynamic because it is bound to <code>props.store.count</code>
      {props.store.count}
    </>
  );
});
