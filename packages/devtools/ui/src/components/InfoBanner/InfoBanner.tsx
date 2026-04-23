import { component$, Slot } from '@qwik.dev/core';
import { IconInfoCircle } from '../Icons/Icons';

/**
 * Informational banner with an icon and message content.
 * Used for contextual hints (e.g. "Vite plugin detected").
 */
export const InfoBanner = component$<{ class?: string }>((props) => {
  return (
    <div
      class={[
        'border-border bg-card-item-bg flex items-center gap-3 rounded-xl border p-4',
        props.class,
      ]}
    >
      <div class="text-accent shrink-0 text-lg">
        <IconInfoCircle class="h-5 w-5" />
      </div>
      <div class="text-sm">
        <Slot />
      </div>
    </div>
  );
});
