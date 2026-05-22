import { component$, Suspense, useAsync$ } from '@qwik.dev/core';
import { getRemoteProduct, type RemoteInput } from './remote.server';

export const RemoteProductTile = component$((props: RemoteInput) => {
  const product = useAsync$(getRemoteProduct, props);

  return (
    <Suspense fallback={<article class="tile muted">Loading remote component...</article>}>
      <article class="tile">
        <span>{product.value.origin}</span>
        <h2>{product.value.title}</h2>
        <p>source: {product.value.source}</p>
        <small>server reads: {product.value.reads}</small>
      </article>
    </Suspense>
  );
});

export const LocalProductPreview = component$((props: { title: string; source: string }) => {
  return (
    <article class="tile local">
      <span>local data</span>
      <h2>{props.title}</h2>
      <p>source: {props.source}</p>
      <small>rendered from host-owned data</small>
    </article>
  );
});
