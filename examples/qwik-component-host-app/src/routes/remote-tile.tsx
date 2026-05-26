import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getRemoteProduct, type RemoteInput } from './remote.server';

export const RemoteProductTile = component$((props: RemoteInput) => {
  const product = useAsync$(getRemoteProduct, props);

  return (
    <Suspense
      fallback={
        <article class="rounded-lg border border-slate-200 bg-slate-50 p-[18px] text-slate-500 shadow-xl shadow-slate-900/5">
          Loading remote component...
        </article>
      }
    >
      <article class="rounded-lg border border-slate-200 bg-white p-[18px] shadow-xl shadow-slate-900/5">
        <span class="font-bold text-slate-500">{product.value.origin}</span>
        <h2 class="mb-2 mt-3 text-2xl font-black">{product.value.title}</h2>
        <p>source: {product.value.source}</p>
        <small>server reads: {product.value.reads}</small>
      </article>
    </Suspense>
  );
});

export const LocalProductPreview = component$((props: { title: string; source: string }) => {
  return (
    <article class="rounded-lg border border-emerald-100 bg-emerald-50 p-[18px] shadow-xl shadow-slate-900/5">
      <span class="font-bold text-slate-500">local data</span>
      <h2 class="mb-2 mt-3 text-2xl font-black">{props.title}</h2>
      <p>source: {props.source}</p>
      <small>rendered from host-owned data</small>
    </article>
  );
});
