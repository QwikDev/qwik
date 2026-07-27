import { component$, useSignal, useTask$, type Signal } from '@qwik.dev/core';
import { describe, expect, it, vi } from 'vitest';
import { ssrRender, testRenderer } from '../test-utils';

const describeSsr = describe.runIf(testRenderer.render === ssrRender);

const AttributePatchChild = component$<{
  value: Signal<unknown>;
  final: unknown;
}>(({ value, final }) => {
  useTask$(() => {
    value.value = final;
  });
  return <div>child</div>;
});

const AttributePatchApp = component$<{
  attribute: 'aria-describedby' | 'disabled';
  initial: unknown;
  final: unknown;
}>((props) => {
  const value = useSignal<unknown>(props.initial);
  return props.attribute === 'disabled' ? (
    <>
      <input id="attribute-target" disabled={value.value as boolean} />
      <AttributePatchChild value={value} final={props.final} />
    </>
  ) : (
    <>
      <input id="attribute-target" aria-describedby={value.value as string | undefined} />
      <AttributePatchChild value={value} final={props.final} />
    </>
  );
});

describeSsr('ssrRender: backpatching', () => {
  it('backpatches Promise attributes without a task', async () => {
    const App = component$(() => (
      <input title={Promise.resolve('final-title') as unknown as string} />
    ));

    const result = await ssrRender(App);
    const input = result.container.querySelector('input')!;
    expect(input.hasAttribute('title')).toBe(false);
    applyBackpatches(result.document);
    expect(input.getAttribute('title')).toBe('final-title');
    result.cleanup();
  });

  it('preserves script delimiters in attribute values', async () => {
    const boundaryValue = '</script><template data-backpatch-marker></template>';
    const App = component$(() => {
      const value = useSignal<unknown>('initial');
      return (
        <>
          <input aria-label={value.value as string} />
          <AttributePatchChild value={value} final={boundaryValue} />
        </>
      );
    });

    const result = await ssrRender(App);
    const script = Array.from(result.document.querySelectorAll('script')).find((script) =>
      script.textContent?.includes('_qwikB')
    )!;
    expect(script.textContent).not.toContain(boundaryValue);
    expect(result.document.querySelector('template[data-backpatch-marker]')).toBeFalsy();
    applyBackpatches(result.document);
    expect(result.container.querySelector('input')?.getAttribute('aria-label')).toBe(boundaryValue);
    result.cleanup();
  });

  it('does not warn when backpatching an attribute', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const App = component$(() => {
      const value = useSignal<unknown>('initial');
      return (
        <>
          <input title={value.value as string} />
          <AttributePatchChild value={value} final="final" />
        </>
      );
    });

    const result = await ssrRender(App);
    expect(result.html).toContain('_qwikB');
    expect(warn).not.toHaveBeenCalled();
    result.cleanup();
    warn.mockRestore();
  });

  it('applies multiple attributes to multiple elements', async () => {
    const App = component$(() => {
      const id = useSignal<unknown>('initial-id');
      const label = useSignal<unknown>('initial-label');
      return (
        <>
          <input aria-labelledby={label.value as string} id={id.value as string} />
          <label aria-labelledby={label.value as string} id={id.value as string}>
            Label
          </label>
          <AttributePatchChild value={label} final="final-label" />
          <AttributePatchChild value={id} final="final-id" />
        </>
      );
    });

    const result = await ssrRender(App);
    applyBackpatches(result.document);
    const elements = result.container.querySelectorAll('input, label');
    for (const element of elements) {
      expect(element.getAttribute('aria-labelledby')).toBe('final-label');
      expect(element.id).toBe('final-id');
    }
    result.cleanup();
  });

  it('serializes async class and style objects before backpatching', async () => {
    const Child = component$<{
      style: Signal<{ color: string }>;
      isActive: Signal<boolean>;
    }>(({ style, isActive }) => {
      useTask$(() =>
        Promise.resolve().then(() => {
          style.value = { color: 'red' };
          isActive.value = true;
        })
      );
      return <div>child</div>;
    });
    const App = component$(() => {
      const style = useSignal({ color: 'blue' });
      const isActive = useSignal(false);
      return (
        <>
          <div id="style-target" style={style.value}>
            Styled
          </div>
          <div id="class-target" class={{ active: isActive.value, inactive: !isActive.value }}>
            Styled
          </div>
          <Child style={style} isActive={isActive} />
        </>
      );
    });

    const result = await ssrRender(App);
    applyBackpatches(result.document);
    const style = result.container.querySelector('#style-target')!;
    const className = result.container.querySelector('#class-target')!;
    expect(style.getAttribute('style')).toBe('color:red');
    expect(className.getAttribute('class')).toBe('active');
    result.cleanup();
  });

  it.each([
    ['removes undefined attributes', 'aria-describedby', 'initial-id', undefined, null],
    ['removes null attributes', 'aria-describedby', 'initial-id', null, null],
    ['removes false boolean attributes', 'disabled', true, false, null],
    ['adds previously undefined attributes', 'aria-describedby', undefined, 'final-id', 'final-id'],
    ['adds true boolean attributes', 'disabled', false, true, ''],
  ] as const)('%s', async (_name, attribute, initial, final, expected) => {
    const result = await ssrRender(AttributePatchApp, {
      props: {
        attribute,
        initial,
        final,
      },
    });
    applyBackpatches(result.document);
    expect(result.container.querySelector('#attribute-target')?.getAttribute(attribute)).toBe(
      expected
    );
    result.cleanup();
  });
});

function applyBackpatches(document: Document): void {
  const scripts = Array.from(document.querySelectorAll('script')).filter((script) =>
    script.textContent?.includes('_qwikB')
  );
  const window = {};
  for (const script of scripts) {
    Object.defineProperty(document, 'currentScript', { configurable: true, value: script });
    // eslint-disable-next-line no-new-func
    Function('window', 'document', script.textContent!)(window, document);
  }
}
