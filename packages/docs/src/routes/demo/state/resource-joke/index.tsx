import {
  component$,
  useResource$,
  Resource,
  useSignal,
} from '@builder.io/qwik';

export default component$(() => {
  const query = useSignal('busy');
  const jokes = useResource$<{ value: string }[]>(
    async ({ track, cleanup }) => {
      track(() => query.value);
      // A good practice is to use `AbortController` to abort the fetching of data if
      // new request comes in. We create a new `AbortController` and register a `cleanup`
      // function which is called when this function re-runs.
      const controller = new AbortController();
      cleanup(() => controller.abort());

      if (query.value.length < 3) {
        return [];
      }

      const url = new URL('https://api.chucknorris.io/jokes/search');
      url.searchParams.set('query', query.value);

      const resp = await fetch(url, { signal: controller.signal });
      const json = (await resp.json()) as { result: { value: string }[] };

      return json.result;
    }
  );

  return (
    <>
      <label>
        Query: <input bind:value={query} />
      </label>
      <button>search</button>
      <Resource
        value={jokes}
        onPending={() => <>loading...</>}
        onResolved={(jokes) => (
          <ul>
            {jokes.map((joke, i) => (
              <li key={i}>{joke.value}</li>
            ))}
          </ul>
        )}
      />
    </>
  );
});
