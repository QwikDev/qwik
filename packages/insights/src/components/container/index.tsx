import { Slot, component$ } from '@qwik.dev/core';

type LayoutProps = {
  position?: 'left' | 'center';
  width?: 'small' | 'medium' | 'full';
};

export default component$<LayoutProps>(({ position = 'left', width = 'full' }) => {
  return (
    <div
      class={[
        'full-width',
        position === 'center' && 'm-auto',
        width === 'small' && 'max-w-[600px]',
        width === 'medium' && 'max-w-[800px]',
      ]}
    >
      <Slot />
    </div>
  );
});
