import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import {
  component$,
  useSignal,
  Fragment as Component,
  Fragment,
  type JSXOutput,
} from '@qwik.dev/core';
import {
  HTML_NS,
  MATH_NS,
  QContainerAttr,
  SVG_NS,
  XLINK_NS,
  XML_NS,
} from '../shared/utils/markers';
import { QContainerValue } from '../shared/types';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: attributes', ({ render }) => {
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
      const { vNode, container } = await render(<SvgComp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <feGaussianBlur></feGaussianBlur>
            <circle cx="50" cy="50" r="50" />
          </svg>
        </Component>
      );
      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="ka">
          <feGaussianBlur></feGaussianBlur>
          <circle cx="50" cy="50" r="50"></circle>
        </svg>
      );
    });
    it('should write attributes to svg', async () => {
      const SvgComp = component$((props: { cx: string; cy: string }) => {
        return (
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
            <circle {...props} r="50" />
          </svg>
        );
      });
      const { vNode, container } = await render(<SvgComp cx="10" cy="10" />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="50" />
          </svg>
        </Component>
      );
      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
          <circle cx="10" cy="10" r="50"></circle>
        </svg>
      );
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
      const { vNode, container } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>{''}</button>
        </Component>
      );

      await expect(container.document.querySelector('button')).toMatchDOM(<button></button>);
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
                <circle cx="10" cy="10" r="50" />
              </svg>
            </Component>
          </button>
        </Component>
      );

      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
          <circle r="50" cx="10" cy="10"></circle>
        </svg>
      );

      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>{''}</button>
        </Component>
      );

      await expect(container.document.body.querySelector('button')).toMatchDOM(<button></button>);
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
      const { vNode, container } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
                <defs></defs>
              </svg>
            </Component>
          </button>
        </Component>
      );

      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
                <defs>
                  <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#ff0000;stop-opacity:1px" />
                    <stop offset="100%" style="stop-color:#0000ff;stop-opacity:1px" />
                  </linearGradient>
                </defs>
              </svg>
            </Component>
          </button>
        </Component>
      );

      expect(
        container.document.querySelector('svg')?.querySelector('linearGradient')?.namespaceURI
      ).toEqual(SVG_NS);
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
      const { vNode, container } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button>
            <Component ssr-required>
              <svg key="hi" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="50"></circle>
                <Fragment ssr-required></Fragment>
              </svg>
            </Component>
          </button>
        </Component>
      );
      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="hi">
          <circle cx="15" cy="15" r="50"></circle>
        </svg>
      );

      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="50"></circle>
                <line x1="0" y1="80" x2="100" y2="20" stroke="black" key="1"></line>
              </svg>
            </Component>
          </button>
        </Component>
      );

      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="hi">
          <circle cx="15" cy="15" r="50"></circle>
          <line x1="0" y1="80" x2="100" y2="20" stroke="black" key="1"></line>
        </svg>
      );

      expect(container.document.querySelector('svg')?.namespaceURI).toEqual(SVG_NS);
      expect(container.document.querySelector('circle')?.namespaceURI).toEqual(SVG_NS);
      expect(container.document.querySelector('line')?.namespaceURI).toEqual(SVG_NS);

      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="50"></circle>
                <Fragment></Fragment>
              </svg>
            </Component>
          </button>
        </Component>
      );
      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="hi">
          <circle cx="15" cy="15" r="50"></circle>
        </svg>
      );
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
      const { vNode, document } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
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
        </Component>
      );
      const namespaceURIForSelector = (selector: string) =>
        Array.from(
          new Set(Array.from(document.querySelectorAll(selector)).flatMap((el) => el.namespaceURI))
        );
      expect(namespaceURIForSelector('.html')).toEqual([HTML_NS]);
      expect(namespaceURIForSelector('.svg')).toEqual([SVG_NS]);
      expect(namespaceURIForSelector('.math')).toEqual([MATH_NS]);
    });

    it('should render svg with dangerouslySetInnerHTML', async () => {
      const SvgComp = component$(() => {
        return (
          <svg
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            dangerouslySetInnerHTML='<circle cx="50" cy="50" r="50"></circle><path d="M10 10"></path><path d="M20 20"></path>'
          ></svg>
        );
      });
      const { vNode, document } = await render(<SvgComp />, { debug });
      const qContainerAttr = { [QContainerAttr]: QContainerValue.HTML };
      expect(vNode).toMatchVDOM(
        <Component>
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...qContainerAttr}></svg>
        </Component>
      );
      await expect(document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" {...qContainerAttr}>
          <circle cx="50" cy="50" r="50" />
          <path d="M10 10" />
          <path d="M20 20" />
        </svg>
      );
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
        const { vNode, document } = await render(<SvgComp />, { debug });
        expect(vNode).toMatchVDOM(
          <Component>
            <svg xmlns="http://www.w3.org/2000/svg" xlink:href="http://www.w3.org/1999/xlink">
              <g>
                <mask id="logo-d" fill="#fff">
                  <use xlink:href="#logo-c"></use>
                </mask>
              </g>
              <text xml:lang="en-US">This is some English text</text>
            </svg>
          </Component>
        );

        const useElement = document.querySelector('use');
        const xLinkHref = useElement?.attributes.getNamedItem('xlink:href');
        expect(xLinkHref?.namespaceURI).toEqual(XLINK_NS);

        const textElement = document.querySelector('text');
        const xmlLang = textElement?.attributes.getNamedItem('xml:lang');
        expect(xmlLang?.namespaceURI).toEqual(XML_NS);
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
      const { vNode, document } = await render(<MathComp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <math xmlns="http://www.w3.org/1998/Math/MathML">
            <msup>
              <mi>x</mi>
              <mn>2</mn>
            </msup>
          </math>
        </Component>
      );

      await expect(document.querySelector('math')).toMatchDOM(
        <math xmlns="http://www.w3.org/1998/Math/MathML">
          <msup>
            <mi>x</mi>
            <mn>2</mn>
          </msup>
        </math>
      );
      expect(document.querySelector('math')?.namespaceURI).toEqual(MATH_NS);
      expect(document.querySelector('msup')?.namespaceURI).toEqual(MATH_NS);
      expect(document.querySelector('mi')?.namespaceURI).toEqual(MATH_NS);
      expect(document.querySelector('mn')?.namespaceURI).toEqual(MATH_NS);
    });
  });
});
