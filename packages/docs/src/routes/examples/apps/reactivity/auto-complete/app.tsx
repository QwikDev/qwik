import { component$, useStore, useTask$ } from '@qwik.dev/core';

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
      <AutoComplete></AutoComplete>
    </article>
  );
});

interface IState {
  searchInput: string;
  searchResults: string[];
  selectedValue: string;
}

export const AutoComplete = component$(() => {
  const state = useStore<IState>({
    searchInput: '',
    searchResults: [],
    selectedValue: '',
  });

  useTask$(async ({ track }) => {
    const searchInput = track(() => state.searchInput);

    if (!searchInput) {
      state.searchResults = [];
      return;
    }

    const controller = new AbortController();
    state.searchResults = await debouncedGetPeople(state.searchInput, controller);

    return () => {
      controller.abort();
    };
  });

  return (
    <div>
      <input type="text" onInput$={(ev, el) => (state.searchInput = el.value)} />
      <SuggestionsListComponent state={state}></SuggestionsListComponent>
    </div>
  );
});

export const SuggestionsListComponent = (props: { state: IState }) => {
  const searchResults = props.state.searchResults;
  return searchResults?.length ? (
    <ul>
      {searchResults.map((suggestion) => {
        return <li onClick$={() => (props.state.selectedValue = suggestion)}>{suggestion}</li>;
      })}
    </ul>
  ) : props.state.searchInput ? (
    <p class="no-results">
      <em>No results</em>
    </p>
  ) : null;
};

const getPeople = (searchInput: string, controller?: AbortController): Promise<string[]> =>
  fetch(`https://swapi.py4e.com/api/people/?search=${searchInput}`, {
    signal: controller?.signal,
  })
    .then((response) => {
      return response.json();
    })
    .then((parsedResponse) => {
      return parsedResponse.results.map((people: { name: string }) => people.name);
    })
    .catch((e) => console.error('fetch failed', e));

function debounce<F extends (...args: any) => any>(fn: F, delay = 500) {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<F>): Promise<ReturnType<F>> => {
    return new Promise((resolve) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        resolve(fn(...(args as any[])));
      }, delay);
    });
  };
}

const debouncedGetPeople = debounce(getPeople, 150);
