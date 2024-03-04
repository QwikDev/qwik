import {
  component$,
  createContextId,
  useContext,
  useContextProvider,
  useStore,
} from '@builder.io/qwik';

// Declare a context ID
export const CTX = createContextId<{ count: number }>('stuff');

export default component$(() => {
  const userData = useStore({ count: 0 });

  // Provide the store to the context under the context ID
  useContextProvider(CTX, userData);

  return <Child />;
});

export const Child = component$(() => {
  const userData = useContext(CTX);
  return (
    <>
      <button onClick$={() => userData.count++}>Increment</button>
      <p>Count: {userData.count}</p>
    </>
  );
});
