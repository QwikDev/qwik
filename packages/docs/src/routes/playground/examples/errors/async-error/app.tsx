import { Catch, component$, Pending, useComputed$, useSignal } from '@qwik.dev/core';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const Profile = component$((props: { userId: number }) => {
  const user = useComputed$(async () => {
    await wait(800);
    if (props.userId % 2 === 0) {
      throw new Error(`User ${props.userId} not found`);
    }
    return { name: `User ${props.userId}` };
  });

  // Reading a failed computed re-throws its error here.
  return <p>Hello, {user.value.name}</p>;
});

// <Pending> shows the loading state, <Catch> shows the failure. Odd ids load, even ids fail.
export default component$(() => {
  const userId = useSignal(1);

  return (
    <main>
      <button onClick$={() => userId.value++}>Load next user</button>

      <Catch
        key={userId.value}
        fallback$={(error) => <p role="alert">Could not load: {error.message}</p>}
      >
        <Pending fallback$={() => <p>Loading user {userId.value}...</p>}>
          <Profile userId={userId.value} />
        </Pending>
      </Catch>
    </main>
  );
});
