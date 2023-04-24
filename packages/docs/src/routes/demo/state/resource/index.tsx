import {
  component$,
  Resource,
  useResource$,
  useSignal,
} from '@builder.io/qwik';

export default component$(() => {
  const prNumber = useSignal('3576');

  const prTitle = useResource$<string>(async ({ track }) => {
    // it will run first on mount (server), then re-run whenever prNumber changes (client)
    // this means this code will run on the server and the browser
    track(() => prNumber.value);
    const response = await fetch(
      `https://api.github.com/repos/BuilderIO/qwik/pulls/${prNumber.value}`
    );
    const data = await response.json();
    return data.title as string;
  });

  return (
    <>
      <input type="number" bind:value={prNumber} />
      <h1>PR#{prNumber}:</h1>
      <Resource
        value={prTitle}
        onPending={() => <p>Loading...</p>}
        onResolved={(title) => <h2>{title}</h2>}
      />
    </>
  );
});
