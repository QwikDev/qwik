import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { ssrRenderToDom } from './ssr-render.unit';
import './vdom-diff.unit';
import { Fragment, Fragment as Component } from '@builder.io/qwik/jsx-runtime';

describe('useSequentialScope', () => {
  it('should render component', async () => {
    const MyComp = component$(() => {
      return <>Hello World!</>;
    });

    const { vNode, container } = await ssrRenderToDom(<MyComp />, { debug: true });
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <>Hello World!</>
      </>
    );
  });
  it('should render nested component', async () => {
    const Parent = component$((props: { salutation: string; name: string }) => {
      return (
        <>
          {props.salutation} <Child name={props.name} />
        </>
      );
    });

    const Child = component$((props: { name: string }) => {
      return <>{props.name}</>;
    });

    const { vNode, container } = await ssrRenderToDom(<Parent salutation="Hello" name="World" />, {
      // debug: true,
    });
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          {'Hello'}{' '}
          <Component>
            <Fragment>World</Fragment>
          </Component>
        </Fragment>
      </Component>
    );
  });
});
