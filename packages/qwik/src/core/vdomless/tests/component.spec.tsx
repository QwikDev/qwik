import { describe, expect, it } from 'vitest';
import {
  csrRender,
  ssrRender,
  type CsrRenderComponent,
  type SsrRenderComponent,
} from '../test-utils';
import { createTextExpressionEffect } from '../dom/effect/effect';

const HelloSsr: SsrRenderComponent<{ name: string }> = (props, ctx) => {
  return `<p>Hello ${ctx.textExpression([props], (props) => props.name)}</p>`;
};

const HelloCsr: CsrRenderComponent<{ name: string }> = (props, ctx) => {
  const element = ctx.document.createElement('p');
  const text = ctx.document.createTextNode('Hello ');
  element.appendChild(text);

  const text2 = ctx.document.createTextNode('');
  element.appendChild(text2);

  const effect = createTextExpressionEffect(text2, [props], (props) => props.name, {
    scheduler: ctx.scheduler,
  });
  ctx.scheduler.notify(effect);

  return [element];
};

describe.each([
  { name: 'ssrRender', render: () => ssrRender(HelloSsr, { name: 'Qwik' }) }, //
  { name: 'csrRender', render: () => csrRender(HelloCsr, { name: 'Qwik' }) }, //
])('$name: component', ({ render }) => {
  it('renders a simple component from generated output', async () => {
    const { container, html, cleanup } = await render();

    expect(container.innerHTML).toBe('<p>Hello Qwik</p>');
    expect(html).toBe('<p>Hello Qwik</p>');

    cleanup();
  });
});
