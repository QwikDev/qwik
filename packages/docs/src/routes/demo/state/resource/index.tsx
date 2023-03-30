import { component$, Resource, useResource$, useSignal } from '@builder.io/qwik';

export default component$(() => {
  const prNumber = useSignal(3576);

  const prTitle = useResource$(async ({ track }) => {
    track(prNumber); // Requires explicit tracking of inputs
    const response = await fetch(
      `https://api.github.com/repos/BuilderIO/qwik/pulls/${prNumber.value}`
    );
    const data = await response.json();
    return (data.title || data.message || 'Error') as string;
  });

  return (
    <>
      <input type="number" bind:value={prNumber} />
      <h1>
        PR#{prNumber}:
        <Resource
          value={prTitle}
          onPending={() => <>Loading...</>}
          onResolved={(title) => <>{title}</>}
        />
      </h1>
    </>
  );
});
