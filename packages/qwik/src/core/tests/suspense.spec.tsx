import { Suspense } from '@qwik.dev/core';
import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$ } from '../shared/component.public';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe('SSR Suspense', () => {
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
    });

    it('should render async children via OoO streaming', async () => {
      const AsyncChild = component$(() => {
        return <p>Async content</p>;
      });

      const { document } = await ssrRenderToDom(
        <div>
          <Suspense fallback={<span>Loading...</span>}>
            <AsyncChild />
          </Suspense>
        </div>,
        { debug }
      );

      const html = document.body.innerHTML;
      // The async content should appear somewhere in the output
      expect(html).toContain('Async content');
    });

    it('should emit fallback with placeholder div for deferred content', async () => {
      const SlowChild = component$(() => {
        return <p>Slow content</p>;
      });

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
      const Child1 = component$(() => <p>Content 1</p>);
      const Child2 = component$(() => <p>Content 2</p>);

      const { document } = await ssrRenderToDom(
        <div>
          <Suspense fallback={<span>Loading 1...</span>}>
            <Child1 />
          </Suspense>
          <Suspense fallback={<span>Loading 2...</span>}>
            <Child2 />
          </Suspense>
        </div>,
        { debug }
      );

      const html = document.body.innerHTML;
      // Both placeholders
      expect(html).toContain('id="qph-0"');
      expect(html).toContain('id="qph-1"');
      // Both OoO templates
      expect(html).toContain('id="qooo-qph-0"');
      expect(html).toContain('id="qooo-qph-1"');
      // Both actual contents
      expect(html).toContain('Content 1');
      expect(html).toContain('Content 2');
    });

    it('should render non-Suspense content before fallback', async () => {
      const SlowChild = component$(() => <p>Slow</p>);

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
      expect(headerPos).toBeLessThan(templatePos);
      expect(footerPos).toBeLessThan(templatePos);
    });

    it('should handle Suspense with no fallback', async () => {
      const Child = component$(() => <p>Content</p>);

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
