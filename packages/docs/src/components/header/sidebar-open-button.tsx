import { component$, type CSSProperties } from '@qwik.dev/core';
import { lucide } from '@qds.dev/ui';

export const SidebarOpenButton = component$(
  (props: { sidebarId: string; class?: string; style?: CSSProperties }) => (
    <button
      type="button"
      popovertarget={props.sidebarId}
      popovertargetaction="show"
      aria-label="Open sidebar"
      class={[
        'flex size-16 shrink-0 items-center justify-center rounded-2xl border-[1.6px] border-base bg-background-base shadow-base',
        props.class,
      ]}
      style={props.style}
    >
      <lucide.panelleftopen class="vanilla-icon" />
    </button>
  )
);
