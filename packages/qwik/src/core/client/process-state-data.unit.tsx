import { describe, expect, it } from 'vitest';
import { domRender } from '@qwik.dev/core/testing';
import type { DomContainer } from './dom-container';
import { processContainerStateData, whenContainerDataReady } from './process-state-data';

describe('container state-data resume errors', () => {
  it('a resume error unblocks whenContainerDataReady instead of hanging silently', async () => {
    const { container } = await domRender(<div id="ok">ok</div>);

    // Drive the container-state pipeline with a throwing iterator
    processContainerStateData(
      container as unknown as DomContainer,
      (function* () {
        yield;
        throw new Error('resume boom');
      })()
    );

    await whenContainerDataReady(container as unknown as DomContainer, () => undefined);
    expect(true).toBe(true);
  });
});
