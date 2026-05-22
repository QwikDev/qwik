import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import {
  getAccountPage,
  getProductPage,
  getSearchPage,
  type PartialInput,
} from './partials.server';

export const ProductPagePartial = component$((props: PartialInput) => {
  const page = useAsync$(getProductPage, props);

  return (
    <Suspense fallback={<article class="partial muted">Loading product partial...</article>}>
      <article class="partial">
        <span>Product partial | {page.value.segment}</span>
        <h2>{page.value.title}</h2>
        <p>Standalone qcomponent HTML with reads: {page.value.reads}</p>
      </article>
    </Suspense>
  );
});

export const AccountPagePartial = component$((props: PartialInput) => {
  const page = useAsync$(getAccountPage, props);

  return (
    <Suspense fallback={<article class="partial muted">Loading account partial...</article>}>
      <article class="partial">
        <span>Account partial | {page.value.segment}</span>
        <h2>{page.value.title}</h2>
        <p>This private route should keep qcomponent output as a standalone Qwik boundary.</p>
      </article>
    </Suspense>
  );
});

export const SearchPagePartial = component$((props: PartialInput) => {
  const page = useAsync$(getSearchPage, props);

  return (
    <Suspense fallback={<article class="partial muted">Loading search partial...</article>}>
      <article class="partial">
        <span>Search partial | {page.value.segment}</span>
        <h2>Search results for {page.value.slug}</h2>
        <ul>
          {page.value.results.map((result) => (
            <li key={result}>{result}</li>
          ))}
        </ul>
      </article>
    </Suspense>
  );
});
