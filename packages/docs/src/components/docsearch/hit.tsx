import { component$, Slot } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import type { InternalDocSearchHit, StoredDocSearchHit } from './types';

interface HitProps {
  hit: InternalDocSearchHit | StoredDocSearchHit;
}

export const Hit = component$((props: HitProps) => {
  return (
    <Link href={props.hit.url}>
      <Slot />
    </Link>
  );
});
