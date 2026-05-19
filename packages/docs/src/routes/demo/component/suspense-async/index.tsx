import { component$, Suspense, useAsync$, useSignal } from '@qwik.dev/core';

type User = {
  name: {
    first: string;
    last: string;
  };
  email: string;
};

const UserCard = component$(() => {
  const user = useAsync$(async ({ abortSignal }) => {
    const response = await fetch('https://randomuser.me/api/', {
      signal: abortSignal,
    });
    const data = (await response.json()) as {
      results: User[];
    };

    return data.results[0];
  });

  return (
    <p>
      User: {user.value.name.first} {user.value.name.last} ({user.value.email})
    </p>
  );
});

export default component$(() => {
  const show = useSignal(false);

  return (
    <section>
      <button onClick$={() => (show.value = !show.value)}>
        {show.value ? 'Hide user' : 'Load random user'}
      </button>

      {show.value && (
        <Suspense fallback={<p>Loading user...</p>}>
          <UserCard />
        </Suspense>
      )}
    </section>
  );
});
