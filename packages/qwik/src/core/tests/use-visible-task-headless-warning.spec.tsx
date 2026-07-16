import { component$, Fragment, useVisibleTask$ } from '@qwik.dev/core';
import { domRender, ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';

const debug = false;

describe.each([{ render: ssrRenderToDom }, { render: domRender }])(
  '$render.name: useVisibleTask headless warning',
  ({ render }) => {
    it('should include the offending source location in the warning', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      try {
        const HeadlessVisibleTask = component$(() => {
          useVisibleTask$(() => {});
          return <Fragment>headless</Fragment>;
        });

        await render(<HeadlessVisibleTask />, { debug });

        const warning = warnSpy.mock.calls.find(
          (call) =>
            typeof call[2] === 'string' &&
            call[2].includes('Falling back to "document-ready" instead.')
        )?.[2];

        expect(warning).toContain('Offending `useVisibleTask$`:');
        expect(warning).toContain('use-visible-task-headless-warning.spec.tsx:');
      } finally {
        warnSpy.mockRestore();
      }
    });
  }
);
