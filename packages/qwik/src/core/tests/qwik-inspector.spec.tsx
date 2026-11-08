import { component$, useSignal } from '@qwik.dev/core';
import { domRender, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../shared/utils/qdev', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shared/utils/qdev')>()),
  qInspector: true,
}));

const SOURCE_LOCATION = /qwik-inspector\.spec\.tsx:\d+:\d+$/;

describe('client rendering with the qwik inspector', () => {
  it('should point client-created elements to their source', async () => {
    const Cmp = component$(() => {
      return (
        <section>
          <p>text</p>
        </section>
      );
    });

    const { container } = await domRender(<Cmp />);

    const section = container.element.querySelector('section')!;
    const paragraph = container.element.querySelector('p')!;
    expect(section.getAttribute('data-qwik-inspector')).toMatch(SOURCE_LOCATION);
    expect(paragraph.getAttribute('data-qwik-inspector')).toMatch(SOURCE_LOCATION);
    expect(paragraph.getAttribute('data-qwik-inspector')).not.toBe(
      section.getAttribute('data-qwik-inspector')
    );
  });

  it('should point elements created after a state change to their source', async () => {
    const Cmp = component$(() => {
      const isOpen = useSignal(false);
      return (
        <div>
          <button onClick$={() => (isOpen.value = true)}></button>
          {isOpen.value && <span>opened</span>}
        </div>
      );
    });

    const { container } = await domRender(<Cmp />);
    await trigger(container.element, 'button', 'click');

    const span = container.element.querySelector('span')!;
    expect(span.getAttribute('data-qwik-inspector')).toMatch(SOURCE_LOCATION);
  });

  it('should keep an explicit data-qwik-inspector prop', async () => {
    const Cmp = component$(() => {
      return <div data-qwik-inspector="custom.tsx:1:1"></div>;
    });

    const { container } = await domRender(<Cmp />);

    const div = container.element.querySelector('div')!;
    expect(div.getAttribute('data-qwik-inspector')).toBe('custom.tsx:1:1');
  });
});
