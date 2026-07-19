import { Slot, component$ } from '@qwik.dev/core';
import { popover } from '@qds.dev/ui';
import { glossary, resolveGlossaryId, type GlossaryId } from './glossary.data';

interface TermProps {
  id: GlossaryId;
}

/**
 * Inline glossary term: the word stays in the prose and a tap reveals its definition as a
 * toggletip. Always pass the word as children (`<Term id="qrl">QRL</Term>`) — a `<Slot>` default
 * would make Qwik emit a `<q:template>` for the unused default, which is invalid inside an MDX
 * `<p>`. `asChild` keeps the popover root/content as `<span>`s and the `<button>` trigger is
 * phrasing content.
 */
export const Term = component$<TermProps>(({ id }) => {
  const canonicalId = resolveGlossaryId(id);
  const entry = glossary[canonicalId];
  const href = `/docs/glossary#${canonicalId}`;
  return (
    <popover.root asChild>
      <span class="">
        <popover.trigger type="button" class="w-auto cursor-help text-standalone-base underline">
          <Slot />
        </popover.trigger>
        <popover.content asChild>
          <span
            role="status"
            class="w-[min(18rem,90vw)]! rounded-lg border-[1.6px] border-accent p-3 text-left text-body-sm leading-[1.5] text-foreground-base shadow-lg [&:popover-open]:block"
          >
            {entry.short}{' '}
            <a href={href} class="whitespace-nowrap text-standalone-accent underline">
              Read more
            </a>
          </span>
        </popover.content>
      </span>
    </popover.root>
  );
});
