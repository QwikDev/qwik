import { BundleIcon } from '../icons/bundle';
import { component$ } from '@builder.io/qwik';

export const BundleCmp = component$<{ name: string }>(({ name }) => {
  return (
    <code>
      <BundleIcon />
      {name}
    </code>
  );
});
