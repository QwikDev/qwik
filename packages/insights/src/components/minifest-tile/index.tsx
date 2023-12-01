import { ManifestIcon } from '../icons/manifest';
import { component$ } from '@builder.io/qwik';

export const ManifestTile = component$<{ hash: string }>(({ hash }) => {
  return (
    <code>
      <ManifestIcon />
      {hash}
    </code>
  );
});
