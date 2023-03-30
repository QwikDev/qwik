import { component$, useStore } from '@builder.io/qwik';

export default component$(() => {
  const userData = useStore({ count: 0 });

  return <Child userData={userData} />;
});

export const Child = component$<{ userData: { count: number } }>(({ userData }) => {
  return (
    <>
      <button onClick$={() => userData.count++}>Increment</button>
      <div>Count: {userData.count}</div>
    </>
  );
});
