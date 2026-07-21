import { component$ } from '@qwik.dev/core';
import { QwikIcon } from '~/components/icons/qwik';

type BrandLockupProps = {
  class?: string;
};

export default component$<BrandLockupProps>(({ class: className }) => {
  return (
    <div class={['flex items-center gap-editorial-4', className]}>
      <QwikIcon class="h-9 w-9 shrink-0" aria-hidden="true" />
      <span class="text-editorial-20 font-semibold tracking-[-0.02em] text-editorial-primary">
        Qwik Insights
      </span>
    </div>
  );
});
