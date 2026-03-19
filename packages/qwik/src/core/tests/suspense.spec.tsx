import { Suspense, type JSXOutput } from '@qwik.dev/core';
import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$ } from '../shared/component.public';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe('SSR Suspense', () => {
  const createDelayedChild = (text: string, delayMs: number) =>
    component$(() => {
      const content = new Promise<JSXOutput>((resolve) => {
        setTimeout(() => {
          resolve(<p>{text}</p>);
        }, delayMs);
      });
      return <>{content}</>;
    });

  describe('basic Suspense', () => {
    it('should render sync children inline (no fallback needed)', async () => {
      const { document } = await ssrRenderToDom(
        <div>
          <Suspense fallback={<span>Loading...</span>}>
            <p>Sync content</p>
          </Suspense>
        </div>,
        { debug }
      );

      const html = document.body.innerHTML;
      // Sync content should be in the output
      expect(html).toContain('Sync content');
      expect(html).not.toContain('qph-');
    });

    it('should render component children inline when ready by emission time', async () => {
      const ReadyChild = component$(() => {
        return <p>Async content</p>;
      });

      const { document } = await ssrRenderToDom(
        <div>
          <Suspense fallback={<span>Loading...</span>}>
            <ReadyChild />
          </Suspense>
        </div>,
        { debug }
      );

      const html = document.body.innerHTML;
      expect(html).toContain('Async content');
      expect(html).not.toContain('Loading...');
      expect(html).not.toContain('qph-');
      expect(html).not.toContain('qooo-');
    });

    it('should emit fallback with placeholder div for deferred content', async () => {
      const SlowChild = createDelayedChild('Slow content', 20);

      const { document } = await ssrRenderToDom(
        <div>
          <Suspense fallback={<span>Loading...</span>}>
            <SlowChild />
          </Suspense>
        </div>,
        { debug }
      );

      const html = document.body.innerHTML;
      // Should have the placeholder div with fallback
      expect(html).toContain('id="qph-0"');
      expect(html).toContain('Loading...');
      // Should have the OoO template with actual content
      expect(html).toContain('id="qooo-qph-0"');
      expect(html).toContain('Slow content');
      // Should have the swap script
      expect(html).toContain('replaceWith');
    });

    it('should handle multiple Suspense boundaries', async () => {
      const Child1 = createDelayedChild('Content 1', 20);
      const Child2 = createDelayedChild('Content 2', 30);

      const { document } = await ssrRenderToDom(
        <div>
          <Suspense fallback={<span>Loading 1...</span>}>
            <Child1 />
          </Suspense>
          <Suspense fallback={<span>Loading 2...</span>}>
            <Child2 />
          </Suspense>
        </div>,
        {
          debug,
          streaming: {
            suspenseFallbackDelay: 10,
          },
        }
      );

      const html = document.body.innerHTML;
      expect(html).toContain('Content 1');
      expect(html).toContain('id="qph-0"');
      expect(html).toContain('id="qph-1"');
      expect(html).toContain('id="qooo-qph-0"');
      expect(html).toContain('id="qooo-qph-1"');
      expect(html).toContain('Content 2');
    });

    it('should render non-Suspense content before fallback', async () => {
      const SlowChild = createDelayedChild('Slow', 20);

      const { document } = await ssrRenderToDom(
        <div>
          <header>Header</header>
          <Suspense fallback={<span>Loading...</span>}>
            <SlowChild />
          </Suspense>
          <footer>Footer</footer>
        </div>,
        { debug }
      );

      const html = document.body.innerHTML;
      // Header and footer should be in the main HTML before any OoO templates
      const headerPos = html.indexOf('Header');
      const footerPos = html.indexOf('Footer');
      const templatePos = html.indexOf('qooo-');
      expect(templatePos).toBeGreaterThan(-1);
      expect(headerPos).toBeLessThan(templatePos);
      expect(footerPos).toBeLessThan(templatePos);
    });

    it('should handle Suspense with no fallback', async () => {
      const Child = createDelayedChild('Content', 20);

      const { document } = await ssrRenderToDom(
        <div>
          <Suspense>
            <Child />
          </Suspense>
        </div>,
        { debug }
      );

      const html = document.body.innerHTML;
      // Should still work — empty placeholder, content via OoO
      expect(html).toContain('id="qph-0"');
      expect(html).toContain('Content');
    });
  });
});
