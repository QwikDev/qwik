import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { createInternalServerComponent } from '../ssr/internal-server-component';

// Regression for the rollback root-array desync (PR #8745). `rollback()` must restore the
// serialization roots completely: `$roots$` and the parallel `$rootObjs$` stay the same length,
// and the dedup map ($seenObjsMap$) must not keep a stale entry for a discarded root. Otherwise
// promoteSharedSegmentRoots reads `segmentRoots[i] === undefined` past the surviving length and
// re-adding a discarded object returns its old out-of-range index instead of a fresh one.
type Probe = {
  rootsLenAfter: number;
  rootObjsLenAfter: number;
  reAddIndex: number;
};

const probes: Probe[] = [];

const RollbackProbe = createInternalServerComponent(async (ssr, _jsx, options) => {
  ssr.streamHandler.streamBlockStart();
  await ssr.renderJSX(<div id="keep">keep</div>, options);

  const cp = ssr.checkpoint();
  const discarded = { marker: 'discarded-root' };
  ssr.serializationCtx.$addRoot$(discarded);
  ssr.rollback(cp);

  // Re-adding the discarded object must allocate a fresh, in-range index (equal to the
  // post-rollback length), not the stale memoized index from before the rollback.
  const rootsLenAfter = ssr.serializationCtx.$roots$.length;
  const rootObjsLenAfter = ssr.serializationCtx.$rootObjs$.length;
  const reAddIndex = ssr.serializationCtx.$addRoot$(discarded);
  probes.push({ rootsLenAfter, rootObjsLenAfter, reAddIndex });

  await ssr.renderJSX(<p id="fb">fallback</p>, options);
  await ssr.streamHandler.streamBlockEnd();
});

describe('SSR rollback serialization roots', () => {
  it('keeps $roots$/$rootObjs$ aligned and re-adds a discarded root at a fresh in-range index', async () => {
    probes.length = 0;
    const { container } = await ssrRenderToDom(
      <main>
        <RollbackProbe />
      </main>,
      { debug: false }
    );

    // The render itself must still produce the surviving + replacement output and resume.
    const el = container.element;
    expect(el.querySelector('#keep')?.textContent).toBe('keep');
    expect(el.querySelector('#fb')?.textContent).toBe('fallback');

    expect(probes).toHaveLength(1);
    const probe = probes[0];
    // After discarding a root, the two parallel arrays must be the same length.
    expect(probe.rootObjsLenAfter).toBe(probe.rootsLenAfter);
    // Re-adding the discarded object must return a fresh index within bounds, not the stale one.
    expect(probe.reAddIndex).toBe(probe.rootsLenAfter);
  });
});
