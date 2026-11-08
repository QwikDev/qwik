import { component$, useSignal, type JSXOutput } from '@qwik.dev/core';
import { describe, expect, it, onTestFinished } from 'vitest';
import { HTML_NS, MATH_NS, SVG_NS } from '../shared/utils/markers';
import { testRenderer } from '../test-utils';
import { triggerAll } from './test-hooks';

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

  it('creates a dynamic tag inside svg in the SVG namespace', async () => {
    const App = component$(() => {
      const Shape = 'circle';
      return (
        <svg viewBox="0 0 10 10">
          <Shape r="1" />
        </svg>
      );
    });
    const { container, cleanup } = await render(App);

    expect(container.querySelector('circle')?.namespaceURI).toBe(SVG_NS);
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

const debug = false;

describe(`${name}: attributes`, () => {
  describe('svg', () => {
    it('should render svg', async () => {
      const SvgComp = component$(() => {
        return (
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="ka">
            <feGaussianBlur></feGaussianBlur>
            <circle cx="50" cy="50" r="50" />
          </svg>
        );
      });
      const { container, cleanup } = await render(SvgComp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelectorAll('feGaussianBlur')).toHaveLength(1);
      expect(container.querySelector('feGaussianBlur')!.textContent).toBe('');
      expect(container.querySelectorAll('circle')).toHaveLength(1);
      expect(container.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('circle')!.getAttribute('cx')).toBe('50');
      expect(container.querySelector('circle')!.getAttribute('cy')).toBe('50');
      expect(container.querySelector('circle')!.getAttribute('r')).toBe('50');
      await expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelector('svg')!.querySelector('feGaussianBlur')!.textContent).toBe('');
      expect(container.querySelector('svg')!.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cx')).toBe(
        '50'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cy')).toBe(
        '50'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('r')).toBe('50');
    });
    it('should write attributes to svg', async () => {
      const SvgComp = component$((props: { cx: string; cy: string }) => {
        return (
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
            <circle {...props} r="50" />
          </svg>
        );
      });
      const { container, cleanup } = await render(SvgComp, {
        ...{ debug },
        props: { cx: '10', cy: '10' },
      });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelectorAll('circle')).toHaveLength(1);
      expect(container.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('circle')!.getAttribute('cx')).toBe('10');
      expect(container.querySelector('circle')!.getAttribute('cy')).toBe('10');
      expect(container.querySelector('circle')!.getAttribute('r')).toBe('50');
      await expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cx')).toBe(
        '10'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cy')).toBe(
        '10'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('r')).toBe('50');
    });
    it('should rerender svg', async () => {
      const SvgComp = component$((props: { cx: string; cy: string }) => {
        return (
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
            <circle cx={props.cx} cy={props.cy} r="50" />
          </svg>
        );
      });
      const Parent = component$(() => {
        const show = useSignal(false);
        return (
          <button onClick$={() => (show.value = !show.value)}>
            {show.value && <SvgComp cx="10" cy="10" />}
          </button>
        );
      });
      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('svg')).toHaveLength(0);
      expect(container.querySelectorAll('circle')).toHaveLength(0);

      expect(container.querySelector('button')?.textContent).toEqual('');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelectorAll('circle')).toHaveLength(1);
      expect(container.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('circle')!.getAttribute('cx')).toBe('10');
      expect(container.querySelector('circle')!.getAttribute('cy')).toBe('10');
      expect(container.querySelector('circle')!.getAttribute('r')).toBe('50');

      await expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('r')).toBe('50');
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cx')).toBe(
        '10'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cy')).toBe(
        '10'
      );

      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('svg')).toHaveLength(0);
      expect(container.querySelectorAll('circle')).toHaveLength(0);

      expect(container.querySelector('button')?.textContent).toEqual('');
    });

    it('should rerender svg nested children', async () => {
      const SvgComp = component$((props: { show: boolean }) => {
        return (
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
            <defs>
              {props.show && (
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style="stop-color:#ff0000;stop-opacity:1px" />
                  <stop offset="100%" style="stop-color:#0000ff;stop-opacity:1px" />
                </linearGradient>
              )}
            </defs>
          </svg>
        );
      });
      const Parent = component$(() => {
        const show = useSignal(false);
        return (
          <button onClick$={() => (show.value = !show.value)}>
            <SvgComp show={show.value} />
          </button>
        );
      });
      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelectorAll('defs')).toHaveLength(1);
      expect(container.querySelector('defs')!.textContent).toBe('');
      expect(container.querySelectorAll('linearGradient')).toHaveLength(0);
      expect(container.querySelectorAll('stop')).toHaveLength(0);

      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelectorAll('defs')).toHaveLength(1);
      expect(container.querySelector('defs')!.textContent).toBe('');
      expect(container.querySelectorAll('linearGradient')).toHaveLength(1);
      expect(container.querySelector('linearGradient')!.textContent).toBe('');
      expect(container.querySelector('linearGradient')!.getAttribute('id')).toBe('grad1');
      expect(container.querySelector('linearGradient')!.getAttribute('x1')).toBe('0%');
      expect(container.querySelector('linearGradient')!.getAttribute('y1')).toBe('0%');
      expect(container.querySelector('linearGradient')!.getAttribute('x2')).toBe('100%');
      expect(container.querySelector('linearGradient')!.getAttribute('y2')).toBe('0%');
      expect(container.querySelectorAll('stop')).toHaveLength(2);
      expect(container.querySelector('stop')!.textContent).toBe('');
      expect(container.querySelector('stop')!.getAttribute('offset')).toBe('0%');
      expect(container.querySelector('stop')!.getAttribute('style')).toBe(
        'stop-color:#ff0000;stop-opacity:1px'
      );
      expect(container.querySelectorAll('stop')[1]!.textContent).toBe('');
      expect(container.querySelectorAll('stop')[1]!.getAttribute('offset')).toBe('100%');
      expect(container.querySelectorAll('stop')[1]!.getAttribute('style')).toBe(
        'stop-color:#0000ff;stop-opacity:1px'
      );

      expect(container.querySelector('svg')?.querySelector('linearGradient')?.namespaceURI).toEqual(
        SVG_NS
      );
    });

    it('should rerender svg child elements', async () => {
      const SvgComp = component$((props: { child: JSXOutput }) => {
        return (
          <svg key="hi" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="15" cy="15" r="50" />
            {props.child}
          </svg>
        );
      });
      const Parent = component$(() => {
        const show = useSignal(false);
        return (
          <button onClick$={() => (show.value = !show.value)}>
            <SvgComp
              child={
                show.value ? <line x1="0" y1="80" x2="100" y2="20" stroke="black" key="1" /> : <></>
              }
            />
          </button>
        );
      });
      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelectorAll('circle')).toHaveLength(1);
      expect(container.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('circle')!.getAttribute('cx')).toBe('15');
      expect(container.querySelector('circle')!.getAttribute('cy')).toBe('15');
      expect(container.querySelector('circle')!.getAttribute('r')).toBe('50');
      expect(container.querySelectorAll('line')).toHaveLength(0);
      await expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cx')).toBe(
        '15'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cy')).toBe(
        '15'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('r')).toBe('50');

      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelectorAll('circle')).toHaveLength(1);
      expect(container.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('circle')!.getAttribute('cx')).toBe('15');
      expect(container.querySelector('circle')!.getAttribute('cy')).toBe('15');
      expect(container.querySelector('circle')!.getAttribute('r')).toBe('50');
      expect(container.querySelectorAll('line')).toHaveLength(1);
      expect(container.querySelector('line')!.textContent).toBe('');
      expect(container.querySelector('line')!.getAttribute('x1')).toBe('0');
      expect(container.querySelector('line')!.getAttribute('y1')).toBe('80');
      expect(container.querySelector('line')!.getAttribute('x2')).toBe('100');
      expect(container.querySelector('line')!.getAttribute('y2')).toBe('20');
      expect(container.querySelector('line')!.getAttribute('stroke')).toBe('black');

      await expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cx')).toBe(
        '15'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cy')).toBe(
        '15'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('r')).toBe('50');
      expect(container.querySelector('svg')!.querySelector('line')!.textContent).toBe('');
      expect(container.querySelector('svg')!.querySelector('line')!.getAttribute('x1')).toBe('0');
      expect(container.querySelector('svg')!.querySelector('line')!.getAttribute('y1')).toBe('80');
      expect(container.querySelector('svg')!.querySelector('line')!.getAttribute('x2')).toBe('100');
      expect(container.querySelector('svg')!.querySelector('line')!.getAttribute('y2')).toBe('20');
      expect(container.querySelector('svg')!.querySelector('line')!.getAttribute('stroke')).toBe(
        'black'
      );

      expect(container.querySelector('svg')?.namespaceURI).toEqual(SVG_NS);
      expect(container.querySelector('circle')?.namespaceURI).toEqual(SVG_NS);
      expect(container.querySelector('line')?.namespaceURI).toEqual(SVG_NS);

      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('svg')).toHaveLength(1);
      expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelectorAll('circle')).toHaveLength(1);
      expect(container.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('circle')!.getAttribute('cx')).toBe('15');
      expect(container.querySelector('circle')!.getAttribute('cy')).toBe('15');
      expect(container.querySelector('circle')!.getAttribute('r')).toBe('50');
      expect(container.querySelectorAll('line')).toHaveLength(0);
      await expect(container.querySelector('svg')!.textContent).toBe('');
      expect(container.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/2000/svg'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cx')).toBe(
        '15'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('cy')).toBe(
        '15'
      );
      expect(container.querySelector('svg')!.querySelector('circle')!.getAttribute('r')).toBe('50');
    });

    it('should render svg and foreignObject with correct namespaces', async () => {
      const Parent = component$(() => {
        return (
          <div class="html">
            <svg class="svg" preserveAspectRatio="true">
              <path class="svg"></path>
              <foreignObject class="svg">
                <div class="html">hello</div>
                <svg class="svg">
                  <circle class="svg"></circle>
                  <foreignObject class="svg">
                    <div class="html">still outside svg</div>
                    <math class="math">
                      <msup class="math">
                        <mi class="math">x</mi>
                        <mn class="math">2</mn>
                      </msup>
                    </math>
                  </foreignObject>
                </svg>
              </foreignObject>
            </svg>
          </div>
        );
      });
      const { container, cleanup } = await render(Parent, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('div')).toHaveLength(3);
      expect(container.querySelector('div')!.textContent).toBe('hellostill outside svgx2');
      expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('html');
      expect(container.querySelectorAll('div')[1]!.textContent).toBe('hello');
      expect(container.querySelectorAll('div')[1]!.getAttribute('class')?.trim() ?? '').toBe(
        'html'
      );
      expect(container.querySelectorAll('div')[2]!.textContent).toBe('still outside svg');
      expect(container.querySelectorAll('div')[2]!.getAttribute('class')?.trim() ?? '').toBe(
        'html'
      );
      expect(container.querySelectorAll('svg')).toHaveLength(2);
      expect(container.querySelector('svg')!.textContent).toBe('hellostill outside svgx2');
      expect(container.querySelector('svg')!.getAttribute('class')?.trim() ?? '').toBe('svg');
      expect(container.querySelector('svg')!.getAttribute('preserveAspectRatio')).toBe('true');
      expect(container.querySelectorAll('svg')[1]!.textContent).toBe('still outside svgx2');
      expect(container.querySelectorAll('svg')[1]!.getAttribute('class')?.trim() ?? '').toBe('svg');
      expect(container.querySelectorAll('svg')[1]!.getAttribute('preserveAspectRatio')).toBe(null);
      expect(container.querySelectorAll('path')).toHaveLength(1);
      expect(container.querySelector('path')!.textContent).toBe('');
      expect(container.querySelector('path')!.getAttribute('class')?.trim() ?? '').toBe('svg');
      expect(container.querySelectorAll('foreignObject')).toHaveLength(2);
      expect(container.querySelector('foreignObject')!.textContent).toBe(
        'hellostill outside svgx2'
      );
      expect(container.querySelector('foreignObject')!.getAttribute('class')?.trim() ?? '').toBe(
        'svg'
      );
      expect(container.querySelectorAll('foreignObject')[1]!.textContent).toBe(
        'still outside svgx2'
      );
      expect(
        container.querySelectorAll('foreignObject')[1]!.getAttribute('class')?.trim() ?? ''
      ).toBe('svg');
      expect(container.querySelectorAll('circle')).toHaveLength(1);
      expect(container.querySelector('circle')!.textContent).toBe('');
      expect(container.querySelector('circle')!.getAttribute('class')?.trim() ?? '').toBe('svg');
      expect(container.querySelectorAll('math')).toHaveLength(1);
      expect(container.querySelector('math')!.textContent).toBe('x2');
      expect(container.querySelector('math')!.getAttribute('class')?.trim() ?? '').toBe('math');
      expect(container.querySelectorAll('msup')).toHaveLength(1);
      expect(container.querySelector('msup')!.textContent).toBe('x2');
      expect(container.querySelector('msup')!.getAttribute('class')?.trim() ?? '').toBe('math');
      expect(container.querySelectorAll('mi')).toHaveLength(1);
      expect(container.querySelector('mi')!.textContent).toBe('x');
      expect(container.querySelector('mi')!.getAttribute('class')?.trim() ?? '').toBe('math');
      expect(container.querySelectorAll('mn')).toHaveLength(1);
      expect(container.querySelector('mn')!.textContent).toBe('2');
      expect(container.querySelector('mn')!.getAttribute('class')?.trim() ?? '').toBe('math');
      const namespaceURIForSelector = (selector: string) =>
        Array.from(
          new Set(Array.from(container.querySelectorAll(selector)).flatMap((el) => el.namespaceURI))
        );
      expect(namespaceURIForSelector('.html')).toEqual([HTML_NS]);
      expect(namespaceURIForSelector('.svg')).toEqual([SVG_NS]);
      expect(namespaceURIForSelector('.math')).toEqual([MATH_NS]);
    });

    describe('xlink and xml namespaces', () => {
      it('should render xlink:href and xml:lang', async () => {
        const SvgComp = component$(() => {
          return (
            <svg xmlns="http://www.w3.org/2000/svg" xlink:href="http://www.w3.org/1999/xlink">
              <g>
                <mask id="logo-d" fill="#fff">
                  <use xlink:href="#logo-c"></use>
                </mask>
              </g>
              <text xml:lang="en-US">This is some English text</text>
            </svg>
          );
        });
        const { container, cleanup } = await render(SvgComp, { debug });
        onTestFinished(cleanup);
        expect(container.querySelectorAll('svg')).toHaveLength(1);
        expect(container.querySelector('svg')!.textContent).toBe('This is some English text');
        expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
          'http://www.w3.org/2000/svg'
        );
        expect(container.querySelector('svg')!.getAttribute('xlink:href')).toBe(
          'http://www.w3.org/1999/xlink'
        );
        expect(container.querySelectorAll('g')).toHaveLength(1);
        expect(container.querySelector('g')!.textContent).toBe('');
        expect(container.querySelectorAll('mask')).toHaveLength(1);
        expect(container.querySelector('mask')!.textContent).toBe('');
        expect(container.querySelector('mask')!.getAttribute('id')).toBe('logo-d');
        expect(container.querySelector('mask')!.getAttribute('fill')).toBe('#fff');
        expect(container.querySelectorAll('use')).toHaveLength(1);
        expect(container.querySelector('use')!.textContent).toBe('');
        expect(container.querySelector('use')!.getAttribute('xlink:href')).toBe('#logo-c');
        expect(container.querySelectorAll('text')).toHaveLength(1);
        expect(container.querySelector('text')!.textContent).toBe('This is some English text');
        expect(container.querySelector('text')!.getAttribute('xml:lang')).toBe('en-US');

        const useElement = container.querySelector('use');
        const xLinkHref = useElement?.attributes.getNamedItem('xlink:href');
        expect(xLinkHref?.namespaceURI).toEqual('http://www.w3.org/1999/xlink');

        const textElement = container.querySelector('text');
        const xmlLang = textElement?.attributes.getNamedItem('xml:lang');
        expect(xmlLang?.namespaceURI).toEqual('http://www.w3.org/XML/1998/namespace');
      });

      it('should render xlink:href and xml:lang as var props', async () => {
        const SvgComp = component$(() => {
          const useProps = { 'xlink:href': '#logo-c' };
          const textProps = { 'xml:lang': 'en-US' };
          return (
            <svg xmlns="http://www.w3.org/2000/svg" xlink:href="http://www.w3.org/1999/xlink">
              <g>
                <mask id="logo-d" fill="#fff">
                  <use {...useProps}></use>
                </mask>
              </g>
              <text {...textProps}>This is some English text</text>
            </svg>
          );
        });
        const { container, cleanup } = await render(SvgComp, { debug });
        onTestFinished(cleanup);
        expect(container.querySelectorAll('svg')).toHaveLength(1);
        expect(container.querySelector('svg')!.textContent).toBe('This is some English text');
        expect(container.querySelector('svg')!.getAttribute('xmlns')).toBe(
          'http://www.w3.org/2000/svg'
        );
        expect(container.querySelector('svg')!.getAttribute('xlink:href')).toBe(
          'http://www.w3.org/1999/xlink'
        );
        expect(container.querySelectorAll('g')).toHaveLength(1);
        expect(container.querySelector('g')!.textContent).toBe('');
        expect(container.querySelectorAll('mask')).toHaveLength(1);
        expect(container.querySelector('mask')!.textContent).toBe('');
        expect(container.querySelector('mask')!.getAttribute('id')).toBe('logo-d');
        expect(container.querySelector('mask')!.getAttribute('fill')).toBe('#fff');
        expect(container.querySelectorAll('use')).toHaveLength(1);
        expect(container.querySelector('use')!.textContent).toBe('');
        expect(container.querySelector('use')!.getAttribute('xlink:href')).toBe('#logo-c');
        expect(container.querySelectorAll('text')).toHaveLength(1);
        expect(container.querySelector('text')!.textContent).toBe('This is some English text');
        expect(container.querySelector('text')!.getAttribute('xml:lang')).toBe('en-US');

        const useElement = container.querySelector('use');
        const xLinkHref = useElement?.attributes.getNamedItem('xlink:href');
        expect(xLinkHref?.namespaceURI).toEqual('http://www.w3.org/1999/xlink');

        const textElement = container.querySelector('text');
        const xmlLang = textElement?.attributes.getNamedItem('xml:lang');
        expect(xmlLang?.namespaceURI).toEqual('http://www.w3.org/XML/1998/namespace');
      });
    });
  });

  describe('math', () => {
    it('should render math', async () => {
      const MathComp = component$(() => {
        return (
          <math xmlns="http://www.w3.org/1998/Math/MathML">
            <msup>
              <mi>x</mi>
              <mn>2</mn>
            </msup>
          </math>
        );
      });
      const { container, cleanup } = await render(MathComp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('math')).toHaveLength(1);
      expect(container.querySelector('math')!.textContent).toBe('x2');
      expect(container.querySelector('math')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/1998/Math/MathML'
      );
      expect(container.querySelectorAll('msup')).toHaveLength(1);
      expect(container.querySelector('msup')!.textContent).toBe('x2');
      expect(container.querySelectorAll('mi')).toHaveLength(1);
      expect(container.querySelector('mi')!.textContent).toBe('x');
      expect(container.querySelectorAll('mn')).toHaveLength(1);
      expect(container.querySelector('mn')!.textContent).toBe('2');

      await expect(container.querySelector('math')!.textContent).toBe('x2');
      expect(container.querySelector('math')!.getAttribute('xmlns')).toBe(
        'http://www.w3.org/1998/Math/MathML'
      );
      expect(container.querySelector('math')!.querySelector('msup')!.textContent).toBe('x2');
      expect(container.querySelector('math')!.querySelector('mi')!.textContent).toBe('x');
      expect(container.querySelector('math')!.querySelector('mn')!.textContent).toBe('2');
      expect(container.querySelector('math')?.namespaceURI).toEqual(MATH_NS);
      expect(container.querySelector('msup')?.namespaceURI).toEqual(MATH_NS);
      expect(container.querySelector('mi')?.namespaceURI).toEqual(MATH_NS);
      expect(container.querySelector('mn')?.namespaceURI).toEqual(MATH_NS);
    });
  });
});
