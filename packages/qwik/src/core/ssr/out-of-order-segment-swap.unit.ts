import { describe, expect, it } from 'vitest';
import { finalizeAndSwapOutOfOrderSegment } from './out-of-order-segment-swap';
import type { SSRContainer, SSROutOfOrderSegment } from './ssr-types';

describe('finalizeAndSwapOutOfOrderSegment', () => {
  it("links the core handlers the segment's events run through after its template", async () => {
    const output: string[] = [];
    const ssr = {
      $emitWhenScriptSafe$: (emit: () => void) => emit(),
      write: (html: string) => output.push(html),
      linkCoreHandlerBundles: () => output.push('<links>'),
      emitOutOfOrderSegmentScripts: () => {},
      emitOutOfOrderExecutorIfNeeded: () => {},
      emitInlineScript: () => {},
      streamHandler: { flush: async () => {} },
    } as unknown as SSRContainer;
    const rendered = {
      container: {
        $finalizeOutOfOrderSegment$: async () => ({ html: '<button>', scripts: '' }),
      },
    } as unknown as SSROutOfOrderSegment;

    await finalizeAndSwapOutOfOrderSegment(ssr, 1, rendered, null);

    // Scripts inside the <template> don't run, so the links must follow it.
    expect(output.slice(output.indexOf('</template>'))).toEqual(['</template>', '<links>']);
  });
});
