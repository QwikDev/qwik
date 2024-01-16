import { assert, suite, test } from 'vitest';
import { renderToString } from '../../server/render';
import { createDocument } from '../../testing/document';
import { createDOM } from '../../testing/library';
import { component$ } from '../component/component.public';
import { _fnSignal } from '../internal';
import { useSignal } from '../use/use-signal';
import type { JSXOutput } from '../render/jsx/types/jsx-node';

suite('jsx signals', () => {
  const RenderJSX = component$(() => {
    const jsx = useSignal<string | JSXOutput>(<span>SSR</span>);
    return (
      <>
        <button
          class="set-jsx"
          onJsx$={(e: CustomEvent<JSXOutput | string>) => (jsx.value = e.detail)}
        />
        <div class="jsx">{jsx.value}</div>
        <div class="jsx-signal">{_fnSignal((p0) => p0.value, [jsx], 'p0.value')}</div>
      </>
    );
  });

  test.skip('SSR jsx', async () => {
    const output = await renderToString(<RenderJSX />, { containerTagName: 'div' });
    const document = createDocument();
    document.body.innerHTML = output.html;
    const div = document.querySelector('.jsx')!;
    assert.equal(div.innerHTML, '<span>SSR</span>');
    const divSignal = document.querySelector('.jsx-signal')!;
    assert.equal(divSignal.innerHTML, '<!--t=1--><span>SSR</span><!---->');
  });

  test('CSR basic jsx', async () => {
    const { screen, render, userEvent } = await createDOM();

    await render(<RenderJSX />);
    const div = screen.querySelector('.jsx')!;
    const divSignal = screen.querySelector('.jsx-signal')!;
    assert.equal(div.innerHTML, '<span>SSR</span>');
    assert.equal(divSignal.innerHTML, '<span>SSR</span>');

    await userEvent('.set-jsx', 'jsx', { detail: 'text' });
    assert.equal(div.innerHTML, 'text');
    assert.equal(divSignal.innerHTML, 'text');

    await userEvent('.set-jsx', 'jsx', { detail: <i>i</i> });
    assert.equal(div.innerHTML, '<i>i</i>');
    assert.equal(divSignal.innerHTML, '<i>i</i>');

    await userEvent('.set-jsx', 'jsx', { detail: <b>b</b> });
    assert.equal(div.innerHTML, '<b>b</b>');
    assert.equal(divSignal.innerHTML, '<b>b</b>');

    await userEvent('.set-jsx', 'jsx', { detail: <>v</> });
    assert.equal(div.innerHTML, 'v');
    assert.equal(divSignal.innerHTML, 'v');

    await userEvent('.set-jsx', 'jsx', { detail: <b>b</b> });
    assert.equal(div.innerHTML, '<b>b</b>');
    assert.equal(divSignal.innerHTML, '<b>b</b>');

    await userEvent('.set-jsx', 'jsx', { detail: 'text' });
    assert.equal(div.innerHTML, 'text');
    assert.equal(divSignal.innerHTML, 'text');
  });

  test('CSR jsx primitives', async () => {
    const { screen, render, userEvent } = await createDOM();

    await render(<RenderJSX />);
    const div = screen.querySelector('.jsx')!;
    const divSignal = screen.querySelector('.jsx-signal')!;
    assert.equal(div.innerHTML, '<span>SSR</span>');
    assert.equal(divSignal.innerHTML, '<span>SSR</span>');

    await userEvent('.set-jsx', 'jsx', { detail: true });
    assert.equal(div.innerHTML, '');
    assert.equal(divSignal.innerHTML, '');

    await userEvent('.set-jsx', 'jsx', { detail: 0 });
    assert.equal(div.innerHTML, '0');
    assert.equal(divSignal.innerHTML, '0');
  });

  test('CSR jsx arrays', async () => {
    const { screen, render, userEvent } = await createDOM();

    await render(<RenderJSX />);
    const div = screen.querySelector('.jsx')!;
    const divSignal = screen.querySelector('.jsx-signal')!;
    assert.equal(div.innerHTML, '<span>SSR</span>');
    assert.equal(divSignal.innerHTML, '<span>SSR</span>');

    await userEvent('.set-jsx', 'jsx', { detail: [] });
    assert.equal(div.innerHTML, '');
    assert.equal(divSignal.innerHTML, '<!--qv --><!--/qv-->');

    await userEvent('.set-jsx', 'jsx', { detail: ['text', <b>b</b>] });
    assert.equal(div.innerHTML, 'text<b>b</b>');
    assert.equal(divSignal.innerHTML, '<!--qv -->text<b>b</b><!--/qv-->');
  });

  test.skip('CSR jsx Promises', async () => {
    // Render signals that resolves promise is not supported
    const { screen, render, userEvent } = await createDOM();

    await render(<RenderJSX />);
    const div = screen.querySelector('.jsx')!;
    const divSignal = screen.querySelector('.jsx-signal')!;
    assert.equal(div.innerHTML, '<span>SSR</span>');
    assert.equal(divSignal.innerHTML, '<span>SSR</span>');

    await userEvent('.set-jsx', 'jsx', { detail: Promise.resolve('Test') });
    assert.equal(div.innerHTML, 'Test');
    assert.equal(divSignal.innerHTML, 'Test');
  });

  const ChildComp = component$(() => <span>ChildComp</span>);

  test('CSR jsx with component', async () => {
    // Render signals that resolves promise is not supported
    const { screen, render, userEvent } = await createDOM();

    await render(<RenderJSX />);
    const div = screen.querySelector('.jsx')!;
    const divSignal = screen.querySelector('.jsx-signal')!;
    assert.equal(div.innerHTML, '<span>SSR</span>');
    assert.equal(divSignal.innerHTML, '<span>SSR</span>');

    await userEvent('.set-jsx', 'jsx', {
      detail: <ChildComp />,
    });
    assert.equal(div.innerHTML, '<!--qv --><span>ChildComp</span><!--/qv-->');
    assert.equal(divSignal.innerHTML, '<!--qv --><span>ChildComp</span><!--/qv-->');
  });
});
