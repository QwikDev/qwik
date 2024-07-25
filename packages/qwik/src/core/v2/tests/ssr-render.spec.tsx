import { ssrRenderToDom, trigger } from '@builder.io/qwik/testing';
import { describe, expect, it } from 'vitest';
import { component$ } from '../../component/component.public';
import {
  Fragment as Component,
  Fragment as Projection,
  Fragment,
  Fragment as InlineComponent,
} from '../../render/jsx/jsx-runtime';
import { SSRComment, SSRRaw, SSRStream, SSRStreamBlock } from '../../render/jsx/utils.public';
import { delay } from '../../util/promises';
import { Slot, useSignal } from '@builder.io/qwik';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe('v2 ssr render', () => {
  it('should render jsx', async () => {
    const { vNode } = await ssrRenderToDom(
      <span>
        <>Hello</> <b>World</b>!
      </span>,
      {
        debug,
      }
    );
    expect(vNode).toMatchVDOM(
      <span>
        <>Hello</> <b>World</b>!
      </span>
    );
  });
  it('should render void element correctly', async () => {
    const { vNode, container } = await ssrRenderToDom(
      <meta content="dark light" name="color-scheme" key="0" />,
      {
        debug,
      }
    );
    expect(vNode).toMatchVDOM(<meta content="dark light" name="color-scheme" />);
    expect(container.document.querySelector('meta')).toMatchDOM(
      <meta content="dark light" name="color-scheme" key="0" />
    );
  });

  it('should render SSRRaw', async () => {
    const TestCmp = component$(() => {
      return (
        <div>
          <Slot />
        </div>
      );
    });
    const Cmp = component$(() => {
      const rerender = useSignal(0);
      return (
        <div data-render={rerender.value} key={rerender.value}>
          <button onClick$={() => rerender.value++}></button>
          <SSRComment data="q:container=html" />
          <SSRRaw data="<div>hello</div>" />
          <SSRComment data="/q:container" />
          <TestCmp>
            <span>a</span>
          </TestCmp>
        </div>
      );
    });
    const { vNode, document } = await ssrRenderToDom(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div data-render="0" key="0">
          <button></button>
          <Component>
            <div>
              <Projection>
                <span>a</span>
              </Projection>
            </div>
          </Component>
        </div>
      </Component>
    );
    expect(document.querySelector('div[data-render]')?.outerHTML).toContain(
      '<!--q:container=html--><div>hello</div><!--/q:container-->'
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div data-render="1" key="1">
          <button></button>
          <Component>
            <div>
              <Projection>
                <span>a</span>
              </Projection>
            </div>
          </Component>
        </div>
      </Component>
    );
    expect(document.querySelector('div[data-render]')?.outerHTML).not.toContain(
      '<!--q:container=html--><div>hello</div><!--/q:container-->'
    );
  });

  describe('component', () => {
    describe('inline', () => {
      it('should render inline component', async () => {
        const HelloWorld = (props: { name: string }) => {
          return <span>Hello {props.name}!</span>;
        };

        const { vNode } = await ssrRenderToDom(<HelloWorld name="World" />, { debug });
        expect(vNode).toMatchVDOM(
          <InlineComponent>
            <span>Hello {'World'}!</span>
          </InlineComponent>
        );
      });
    });
    describe('component$', () => {
      it('should render simple component', async () => {
        const HelloWorld = component$((props: { name: string }) => {
          return <span>Hello {props.name}!</span>;
        });

        const { vNode } = await ssrRenderToDom(<HelloWorld name="World" />, { debug });
        expect(vNode).toMatchVDOM(
          <Fragment>
            <span>Hello {'World'}!</span>
          </Fragment>
        );
      });
    });
    it('should render nested components', async () => {
      const Child = component$((props: { name: string }) => {
        return <span>Hello Child: {props.name}</span>;
      });
      const Parent = component$((props: { name: string }) => {
        return <Child name={props.name} />;
      });

      const { vNode } = await ssrRenderToDom(<Parent name="World" />, { debug });
      expect(vNode).toMatchVDOM(
        <Fragment>
          <Fragment>
            <span>Hello Child: {'World'}</span>
          </Fragment>
        </Fragment>
      );
    });
  });
  describe('stream', () => {
    it('should render comment', async () => {
      const CommentCmp = component$(() => {
        return <SSRComment data="foo" />;
      });

      const { vNode, document } = await ssrRenderToDom(<CommentCmp />, { debug });
      expect(vNode).toMatchVDOM(<Component></Component>);
      expect((document.body.firstChild as Element).outerHTML).toEqual('<!--foo-->');
    });

    it('should render SSRStreamBlock', async () => {
      const { vNode, document } = await ssrRenderToDom(
        <div id="stream-block">
          <SSRStreamBlock>
            <div>stream content</div>
          </SSRStreamBlock>
        </div>,
        { debug }
      );
      expect(vNode).toMatchVDOM(
        <div id="stream-block">
          <Component>
            <div>stream content</div>
          </Component>
        </div>
      );
      // we should not stream the comment nodes of the SSRStreamBlock
      expect(document.querySelector('#stream-block')).toMatchDOM(
        <div id="stream-block">
          <div>stream content</div>
        </div>
      );
    });

    it('should render values from generator', async () => {
      const { vNode } = await ssrRenderToDom(
        <ul>
          <SSRStream>
            {async function* () {
              for (let i = 0; i < 5; i++) {
                yield <li>yield: {i}</li>;
                await delay(10);
              }
            }}
          </SSRStream>
        </ul>,
        { debug }
      );

      expect(vNode).toMatchVDOM(
        <ul>
          <li>
            {'yield: '}
            {'0'}
          </li>
          <li>
            {'yield: '}
            {'1'}
          </li>
          <li>
            {'yield: '}
            {'2'}
          </li>
          <li>
            {'yield: '}
            {'3'}
          </li>
          <li>
            {'yield: '}
            {'4'}
          </li>
        </ul>
      );
    });

    it('should render values from generator with stream', async () => {
      const { vNode } = await ssrRenderToDom(
        <ul>
          <SSRStream>
            {async function (stream: any) {
              for (let i = 0; i < 5; i++) {
                stream.write(<li>raw: {i}</li>);
                await delay(10);
              }
            }}
          </SSRStream>
        </ul>,
        { debug }
      );

      expect(vNode).toMatchVDOM(
        <ul>
          <li>
            {'raw: '}
            {'0'}
          </li>
          <li>
            {'raw: '}
            {'1'}
          </li>
          <li>
            {'raw: '}
            {'2'}
          </li>
          <li>
            {'raw: '}
            {'3'}
          </li>
          <li>
            {'raw: '}
            {'4'}
          </li>
          {''}
        </ul>
      );
    });
  });
});
