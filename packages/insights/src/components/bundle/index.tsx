import { BundleIcon } from '../icons/bundle';
import { component$ } from '@qwik.dev/core';

export const BundleCmp = component$<{ name: string }>(({ name }) => {
  return (
    <code>
      <BundleIcon />
      <span class="ml-1">{name}</span>
    </code>
  );
});
