import { component$, useStore } from '@qwik.dev/core';

export default component$(() => {
  const userData = useStore({ count: 0 });
  return <Child userData={userData} />;
});

interface ChildProps {
  userData: { count: number };
}
export const Child = component$<ChildProps>(({ userData }) => {
  return (
    <>
      <button onClick$={() => userData.count++}>Increment</button>
      <p>Count: {userData.count}</p>
    </>
  );
});
