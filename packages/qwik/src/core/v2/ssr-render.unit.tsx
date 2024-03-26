import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { Fragment, Fragment as InlineComponent } from '../render/jsx/jsx-runtime';
import { ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

describe('v2 ssr render', () => {
  it('should render jsx', async () => {
    const { vNode } = await ssrRenderToDom(
      <span>
        <>Hello</> <b>World</b>!
      </span>
    );
    expect(vNode).toMatchVDOM(
      <span>
        <>Hello</> <b>World</b>!
      </span>
    );
  });
  it('should render void element correctly', async () => {
    const { vNode, container } = await ssrRenderToDom(
      <meta content="dark light" name="color-scheme" key="0" />
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

        const { vNode } = await ssrRenderToDom(<HelloWorld name="World" />);
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

        const { vNode } = await ssrRenderToDom(<HelloWorld name="World" />);
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

      const { vNode } = await ssrRenderToDom(<Parent name="World" />, { debug: false });
      expect(vNode).toMatchVDOM(
        <Fragment>
          <Fragment>
            <span>Hello Child: {'World'}</span>
          </Fragment>
        </Fragment>
      );
    });
  });
});
