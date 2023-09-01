import { Slot, component$ } from '@builder.io/qwik';

import styles from './styles.module.css';

type LayoutProps = {
  position?: 'left' | 'center';
  width?: 'small' | 'medium' | 'full';
};

export default component$<LayoutProps>(({ position = 'left', width = 'full' }) => {
  return (
    <div
      class={[
        styles.container,
        position === 'center' && styles.center,
        width === 'small' && styles.small,
        width === 'medium' && styles.medium,
      ]}
    >
      <Slot />
    </div>
  );
});
