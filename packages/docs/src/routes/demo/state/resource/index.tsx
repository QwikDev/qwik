import {
  component$,
  Resource,
  useResource$,
  useSignal,
} from '@builder.io/qwik';

export default component$(() => {
  const postId = useSignal('23');

  const postTitle = useResource$<string>(async ({ track, cleanup }) => {
    // It will run first on mount (server), then re-run whenever postId changes (client)
    // this means this code will run on the server and the browser
    const controller = new AbortController();
    track(() => postId.value);
    cleanup(() => controller.abort());

    try {
      const response = await fetch(
        `https://jsonplaceholder.typicode.com/posts/${postId.value}`,
        { signal: controller.signal }
      );
      const data = await response.json();
      return data.title as string;
    } catch (e) {
      // For demo purposes only, we recommend not to use try/catch inside useResource$
      // and instead use the `onRejected` handler on the `<Resource />` component
      return `invalid post '${postId.value}'`;
    }
  });

  return (
    <>
      <input type="number" bind:value={postId} max={100} min={0} />
      <h1>Post#{postId}:</h1>
      <Resource
        value={postTitle}
        onPending={() => <p>Loading...</p>}
        onResolved={(title) => <h2>{title}</h2>}
      />
    </>
  );
});
