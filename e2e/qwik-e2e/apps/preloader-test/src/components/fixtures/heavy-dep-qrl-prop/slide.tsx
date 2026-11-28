import { component$, type QRL } from '@qwik.dev/core';

export const Slide = component$<{
  src: string;
  index: number;
  onOpen$: QRL<(index: number) => void>;
}>((props) => (
  <button data-testid={`slide-${props.index}`} onClick$={() => props.onOpen$(props.index)}>
    {props.src}
  </button>
));
