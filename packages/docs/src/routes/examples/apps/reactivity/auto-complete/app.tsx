import { component$, useAsync$, useSignal, type Signal } from '@qwik.dev/core';

export default component$(() => {
  return (
    <article>
      This example features an auto-complete component with a debounce of 150 ms.
      <br />
      <br />
      Go ahead, search for Star Wars characters such as "Luke Skywalker", it uses the{' '}
      <a href="https://swapi.py4e.com/">Star Wars API</a>:
      <br />
      <br />
      <AutoComplete />
    </article>
  );
});

export const AutoComplete = component$(() => {
  const searchInput = useSignal('');
  const selectedValue = useSignal('');

  const searchResults = useAsync$<string[]>(
    async ({ track, abortSignal }) => {
      const query = track(searchInput);

      if (!query) {
        return [];
      }

      // Debounce: wait 150ms before making the request
      await new Promise((resolve) => setTimeout(resolve, 150));

      // If the signal was aborted during the debounce, this will throw
      const response = await fetch(`https://swapi.py4e.com/api/people/?search=${query}`, {
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const data = await response.json();
      return data.results.map((people: { name: string }) => people.name);
    },
    { initial: [] }
  );

  return (
    <div>
      <input type="text" bind:value={searchInput} />
      <SuggestionsListComponent
        results={searchResults.value}
        query={searchInput.value}
        bind:select={selectedValue}
      />
    </div>
  );
});

export const SuggestionsListComponent = component$<{
  results: string[];
  query: string;
  'bind:select': Signal<string>;
}>(({ results, query, 'bind:select': selected }) => {
  return results.length ? (
    <ul>
      {results.map((suggestion) => {
        return (
          <li
            style={{
              cursor: 'pointer',
              padding: '0.25em 0',
              background: suggestion === selected.value ? '#eee' : 'transparent',
            }}
            onClick$={() => (selected.value = suggestion)}
          >
            {suggestion}
          </li>
        );
      })}
    </ul>
  ) : query ? (
    <p class="no-results">
      <em>No results</em>
    </p>
  ) : null;
});
