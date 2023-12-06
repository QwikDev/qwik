import { BundleIcon } from '../icons/bundle';
import { component$ } from '@builder.io/qwik';

export const BundleCmp = component$<{ name: string }>(({ name }) => {
  return (
    <code>
      <BundleIcon />
      <span class="ml-1">{name}</span>
    </code>
  );
});
