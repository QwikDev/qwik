import { $, component$, ErrorBoundary, render, setPlatform } from '@qwik.dev/core';
import { createDocument, domRender, getTestPlatform, ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';

const debug = false;

// Runs ONLY in the vitest.flag-off.config.ts project (errorBoundary experimental flag OFF):
// pins that the disabled feature leaves the default runtime path untouched.
describe('errorBoundary flag off', () => {
  it('<ErrorBoundary> fails with the enablement hint', async () => {
    await expect(
      ssrRenderToDom(
        <ErrorBoundary fallback$={$(() => 'fb')}>
          <div />
        </ErrorBoundary>,
        { debug }
      )
    ).rejects.toThrow(/errorBoundary/);
  });

  it('does not register qerror or unhandledrejection listeners', async () => {
    setPlatform(getTestPlatform());
    const document = createDocument();
    // Mock window's addEventListener is a noop; make it spyable.
    const windowListeners: string[] = [];
    (document.defaultView as any).addEventListener = vi.fn((type: string) =>
      windowListeners.push(type)
    );
    const documentListeners: string[] = [];
    const originalAdd = document.addEventListener.bind(document);
    vi.spyOn(document, 'addEventListener').mockImplementation(((
      type: string,
      ...rest: unknown[]
    ) => {
      documentListeners.push(type);
      return (originalAdd as any)(type, ...rest);
    }) as any);
    const host = document.createElement('div');
    document.body.appendChild(host);
    await render(host, <div id="app">app</div>);
    expect(documentListeners).not.toContain('qerror');
    expect(windowListeners).not.toContain('unhandledrejection');
  });

  it('handleError without an error store rethrows synchronously', async () => {
    const Dummy = component$(() => <div id="app">app</div>);
    const { container } = await domRender(<Dummy />, { debug });
    const err = new Error('boom');
    expect(() => container.handleError(err, container.rootVNode)).toThrow(err);
  });
});
