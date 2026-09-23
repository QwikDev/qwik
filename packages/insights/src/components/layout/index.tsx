import { Slot, component$ } from '@qwik.dev/core';

import Header from '../header';

type LayoutProps = {
  mode?: 'default' | 'bright';
  class?: string;
};

export default component$<LayoutProps>(({ mode = 'default', ...props }) => {
  return (
    <div class="min-h-screen bg-editorial-canvas font-editorial-ui text-editorial-primary">
      <Header />
      <main
        class={[
          'min-h-[calc(100vh-var(--spacing-editorial-header))]',
          mode === 'bright' ? 'bg-editorial-surface' : 'bg-editorial-canvas',
          props.class,
        ]}
      >
        <Slot />
      </main>
    </div>
  );
});
