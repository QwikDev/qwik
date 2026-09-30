import { component$ } from '@qwik.dev/core';
import { QwikIcon } from '~/components/icons/qwik';

type BrandLockupProps = {
  class?: string;
  compact?: boolean;
};

export default component$<BrandLockupProps>(({ class: className, compact = false }) => {
  return (
    <div class={['flex items-center', compact ? 'gap-editorial-3' : 'gap-editorial-4', className]}>
      <QwikIcon class={compact ? 'h-8 w-8 shrink-0' : 'h-9 w-9 shrink-0'} aria-hidden="true" />
      <span
        class={[
          'font-semibold tracking-[-0.02em] text-editorial-primary',
          compact ? 'text-editorial-16' : 'text-editorial-20',
        ]}
      >
        Qwik Insights
      </span>
    </div>
  );
});
