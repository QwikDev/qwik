import { component$ } from '@qwik.dev/core';
import type { CodeModule } from '../types';

interface HighlightedCodeListProps {
  codes: CodeModule[];
  highlighted: string[];
}

export const HighlightedCodeList = component$<HighlightedCodeListProps>(
  ({ codes, highlighted }) => {
    return (
      <>
        {codes.map((item, index) => (
          <div
            key={item.pathId}
            class="border-glass-border bg-card-item-bg hover:bg-card-item-hover-bg mb-4 rounded-xl border p-4 transition-colors"
          >
            <div class="text-primary mb-2 text-base font-semibold break-all">{item.pathId}</div>
            <pre class="overflow-hidden" dangerouslySetInnerHTML={highlighted[index] || ''} />
          </div>
        ))}
      </>
    );
  }
);
