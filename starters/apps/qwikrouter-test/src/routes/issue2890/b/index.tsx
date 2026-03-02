import { routeLoader$ } from "@qwik.dev/router";
import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";

export const useUndefined = routeLoader$(() => {
  return undefined;
});

export const useGetQuery = routeLoader$(({ query }) => {
  return {
    query: query.get("query") ?? "NONE",
    hash: query.get("hash") ?? "NONE",
  };
});

export default component$(() => {
  const signal = useSignal({});
  const data = useGetQuery();
  const undefinedLoader = useUndefined();

  useVisibleTask$(() => {
    const url = new URL(window.location.href);
    signal.value = {
      query: url.searchParams.get("query") ?? "NONE",
      hash: url.hash,
    };
  });

  return (
    <div>
      <h1>Query</h1>
      <div>{undefinedLoader.value}</div>
      <p id="loader">LOADER: {JSON.stringify(data.value)}</p>
      <p id="browser">BROWSER: {JSON.stringify(signal.value)}</p>
    </div>
  );
});
