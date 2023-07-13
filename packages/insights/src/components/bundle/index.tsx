import { component$ } from '@builder.io/qwik';
import { css } from '~/styled-system/css';
import { BundleIcon } from '../icons/bundle';

export const BundleCmp = component$<{ name: string }>(({ name }) => {
  return (
    <code
      class={css({
        fontFamily: 'monospace',
        fontWeight: 'bold',
        fontSize: '14px',
        padding: '2px 4px',
        backgroundColor: '#fbf7f3',
        border: '1px solid #CCC',
        borderRadius: '5px',
        whiteSpace: 'nowrap',
      })}
    >
      <BundleIcon
        class={css({ display: 'inline-block', marginRight: '4px', marginBottom: '3px' })}
      />
      {name}
    </code>
  );
});
