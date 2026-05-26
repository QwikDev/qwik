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
    <Suspense
      fallback={
        <article class="rounded-lg border border-slate-200 bg-slate-50 p-[18px] text-slate-500 shadow-xl shadow-slate-900/5">
          Loading product partial...
        </article>
      }
    >
      <article class="rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
        <span class="font-bold text-slate-500">Product partial | {page.value.segment}</span>
        <h2 class="mb-2 mt-3 text-2xl font-black">{page.value.title}</h2>
        <p>Standalone qcomponent HTML with reads: {page.value.reads}</p>
      </article>
    </Suspense>
  );
});

export const AccountPagePartial = component$((props: PartialInput) => {
  const page = useAsync$(getAccountPage, props);

  return (
    <Suspense
      fallback={
        <article class="rounded-lg border border-slate-200 bg-slate-50 p-[18px] text-slate-500 shadow-xl shadow-slate-900/5">
          Loading account partial...
        </article>
      }
    >
      <article class="rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
        <span class="font-bold text-slate-500">Account partial | {page.value.segment}</span>
        <h2 class="mb-2 mt-3 text-2xl font-black">{page.value.title}</h2>
        <p>This private route should keep qcomponent output as a standalone Qwik boundary.</p>
      </article>
    </Suspense>
  );
});

export const SearchPagePartial = component$((props: PartialInput) => {
  const page = useAsync$(getSearchPage, props);

  return (
    <Suspense
      fallback={
        <article class="rounded-lg border border-slate-200 bg-slate-50 p-[18px] text-slate-500 shadow-xl shadow-slate-900/5">
          Loading search partial...
        </article>
      }
    >
      <article class="rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
        <span class="font-bold text-slate-500">Search partial | {page.value.segment}</span>
        <h2 class="mb-2 mt-3 text-2xl font-black">Search results for {page.value.slug}</h2>
        <ul class="list-disc space-y-2 pl-5">
          {page.value.results.map((result) => (
            <li key={result}>{result}</li>
          ))}
        </ul>
      </article>
    </Suspense>
  );
});
