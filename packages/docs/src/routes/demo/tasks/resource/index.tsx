import { component$, Resource, useResource$, useSignal } from '@builder.io/qwik';
import { useLocation } from '@builder.io/qwik-city';

export default component$(() => {
  const a = useSignal(123);
  const b = useSignal(456);
  const location = useLocation();

  const sum = useResource$(async ({ track }) => {
    track(a);
    track(b);
    const url = new URL(`/demo/api/add/`, location.url);
    url.searchParams.set('a', a.value.toString());
    url.searchParams.set('b', b.value.toString());
    url.searchParams.set('delay', (500).toString());
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    return await response.json();
  });

  return (
    <>
      a=
      <input type="number" bind:value={a} />
      b=
      <input type="number" bind:value={b} />
      <h1>
        {a} + {b} ={' '}
        <Resource
          value={sum}
          onPending={() => <>computing...</>}
          onResolved={(value) => <>{value}</>}
        />
      </h1>
    </>
  );
});
