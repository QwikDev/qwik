import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import {
  Fragment,
  Fragment as InlineComponent,
  Fragment as Component,
} from '../render/jsx/jsx-runtime';
import { ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { SSRComment, SSRStream, SSRStreamBlock } from '../render/jsx/utils.public';
import { delay } from '../util/promises';

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
      expect(document.querySelector('#stream-block')?.innerHTML).toEqual(
        '<div>stream content</div>'
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
        </ul>
      );
    });
  });
});
