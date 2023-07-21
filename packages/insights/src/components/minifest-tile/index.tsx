import { component$ } from '@builder.io/qwik';
import { css } from '~/styled-system/css';
import { ManifestIcon } from '../icons/manifest';

export const ManifestTile = component$<{ hash: string }>(({ hash }) => {
  return (
    <code
      class={css({
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fontSize: '14px',
        padding: '2px 4px',
        backgroundColor: '#EEE',
        border: '1px solid #CCC',
        borderRadius: '5px',
        whiteSpace: 'nowrap',
      })}
    >
      <ManifestIcon
        class={css({ display: 'inline-block', marginBottom: '1px', marginRight: '2px' })}
      />
      {hash}
    </code>
  );
});
