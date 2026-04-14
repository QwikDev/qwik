import { component$, Slot, useSignal } from '@qwik.dev/core';
import { collapsible, lucide } from '@qds.dev/ui';

const noteContent =
  'note-content block p-4 text-body-sm text-foreground-base leading-[1.6] [&>p]:mt-2 [&>p]:mb-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>pre]:my-4 [&>pre]:border-0 [&>pre]:shadow-none [&>pre]:rounded-lg [&>pre]:p-3 [&>pre]:bg-background-accent [&>pre]:font-normal [&_code]:font-normal';

/**
 * Short note — renders as a simple card with no collapse.
 *
 * Usage in MDX: <Note>Short note content here.</Note>
 */
export const Note = component$<{ title?: string }>((props) => {
  return (
    <span class="block border-[1.6px] border-accent rounded-2xl overflow-clip">
      <span class="block bg-background-accent px-4 py-3 -mt-px">
        <span class="font-bold text-body-sm text-foreground-accent">{props.title ?? 'NOTE'}</span>
      </span>
      <span class={noteContent}>
        <Slot />
      </span>
    </span>
  );
});

/**
 * Long note — renders as a collapsible card using QDS collapsible.
 *
 * Usage in MDX: <LongNote title="Why use a regular function?"> Long content here... </LongNote>
 */
export const LongNote = component$<{ title: string }>((props) => {
  const isOpen = useSignal(false);

  return (
    <collapsible.root
      bind:open={isOpen}
      class="border-[1.6px] border-accent rounded-2xl overflow-clip"
    >
      <collapsible.trigger class="w-full cursor-pointer bg-background-accent hover:bg-background-emphasis px-4 py-3 flex items-center justify-between gap-4">
        <span class="font-bold text-body-sm text-foreground-accent">{props.title}</span>
        <span class="flex items-center gap-2 text-standalone-accent text-body-sm shrink-0">
          {isOpen.value ? (
            <>
              <lucide.minus class="size-4" />
              <span>Hide</span>
            </>
          ) : (
            <>
              <lucide.plus class="size-4" />
              <span>Show</span>
            </>
          )}
        </span>
      </collapsible.trigger>
      <collapsible.content>
        <span class={'border-t-[1.6px] border-accent ' + noteContent}>
          <Slot />
        </span>
      </collapsible.content>
    </collapsible.root>
  );
});
