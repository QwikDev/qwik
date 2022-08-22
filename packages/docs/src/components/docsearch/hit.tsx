import { component$, Slot } from '@builder.io/qwik';
import type { InternalDocSearchHit, StoredDocSearchHit } from './types';

interface HitProps {
  hit: InternalDocSearchHit | StoredDocSearchHit;
}

export const Hit = component$(({ hit }: HitProps) => {
  return (
    <a href={hit.url}>
      <Slot />
    </a>
  );
});
