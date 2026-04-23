import { component$, Slot, type QRL } from '@qwik.dev/core';

interface IconButtonProps {
  onClick$?: QRL<() => void>;
  active?: boolean;
  title?: string;
  class?: string;
}

/**
 * Small toolbar button with icon slot and optional text.
 * Supports active/inactive visual states.
 */
export const IconButton = component$<IconButtonProps>((props) => {
  return (
    <button
      class={[
        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
        props.active
          ? 'bg-primary/20 text-primary'
          : 'text-muted-foreground hover:bg-card-item-hover-bg hover:text-foreground',
        props.class,
      ]}
      title={props.title}
      aria-label={props.title}
      onClick$={props.onClick$}
    >
      <Slot />
    </button>
  );
});
