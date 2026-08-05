import { component$ } from '@qwik.dev/core';
import { EAGER_TRANSITIVE_BLOCKS } from './eager-transitive-registry';

export const EagerTransitiveGenerator = component$(() => {
  const block = EAGER_TRANSITIVE_BLOCKS.product;
  const Component = block.component;

  return <Component />;
});
