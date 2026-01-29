import { component$, Slot } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import type { InternalDocSearchHit, StoredDocSearchHit } from "./types";

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
