import { component$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { HTML_NS, MATH_NS, SVG_NS } from '../shared/utils/markers';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: namespaces`, () => {
  it('creates SVG descendants in the SVG namespace', async () => {
    const App = component$(() => (
      <svg viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="5" />
      </svg>
    ));
    const { container, cleanup } = await render(App);

    expect(container.querySelector('svg')?.namespaceURI).toBe(SVG_NS);
    expect(container.querySelector('circle')?.namespaceURI).toBe(SVG_NS);
    cleanup();
  });

  it('creates branch and row nodes inside svg in the SVG namespace', async () => {
    const App = component$(() => {
      const show = useSignal(false);
      const points = useSignal([1]);
      return (
        <section>
          <button
            onClick$={() => {
              show.value = true;
              points.value = [1, 2];
            }}
          />
          <svg viewBox="0 0 10 10">
            {show.value && <circle r="1" />}
            {points.value.map((point) => (
              <rect key={point} width={point} />
            ))}
          </svg>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('circle')?.namespaceURI).toBe(SVG_NS);
    const rects = Array.from(container.querySelectorAll('rect'), (rect) => rect.namespaceURI);
    expect(rects).toEqual([SVG_NS, SVG_NS]);
    cleanup();
  });

  it('switches namespaces through foreignObject and nested math', async () => {
    const App = component$(() => (
      <svg>
        <foreignObject>
          <div class="html">html</div>
          <math>
            <mi>x</mi>
          </math>
        </foreignObject>
      </svg>
    ));
    const { container, cleanup } = await render(App);

    expect(container.querySelector('foreignObject')?.namespaceURI).toBe(SVG_NS);
    expect(container.querySelector('.html')?.namespaceURI).toBe(HTML_NS);
    expect(container.querySelector('math')?.namespaceURI).toBe(MATH_NS);
    expect(container.querySelector('mi')?.namespaceURI).toBe(MATH_NS);
    cleanup();
  });
});
