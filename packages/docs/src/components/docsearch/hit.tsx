import { component$, Slot } from '@qwikdev/core';
import type { InternalDocSearchHit, StoredDocSearchHit } from './types';

interface HitProps {
  hit: InternalDocSearchHit | StoredDocSearchHit;
}

export const Hit = component$((props: HitProps) => {
  return (
    <a href={props.hit.url}>
      <Slot />
    </a>
  );
});
