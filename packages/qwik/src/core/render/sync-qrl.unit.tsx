import { assert, suite, test } from 'vitest';
import { createDOM } from '../../testing/library';
import { sync$ } from '../qrl/qrl.public';
import { renderToString } from '../../server/render';

suite('sync-qrl', () => {
  test('default updates the checkbox', async () => {
    const { screen, render } = await createDOM();
    await render(<input type="checkbox" checked={false} />);
    const input = screen.querySelector('input')!;
    assert.equal(input.checked, false);
    input.click();
    assert.equal(input.checked, true);
  });

  test('default prevents updates the checkbox', async () => {
    const { screen, userEvent, render } = await createDOM();
    await render(
      <input
        type="checkbox"
        onClick$={[
          sync$((e: Event, target: Element) => {
            if (target.getAttribute('shouldPreventDefault')) {
              e.preventDefault();
            }
            target.setAttribute('prevented', String(e.defaultPrevented));
          }),
        ]}
      />
    );
    const input = screen.querySelector('input')!;
    await userEvent(input, 'click');
    assert.equal(input.getAttribute('prevented'), 'false');
    input.setAttribute('shouldPreventDefault', 'true');
    await userEvent(input, 'click');
    assert.equal(input.getAttribute('prevented'), 'true');
  });

  // Currently the testing does not support resuming from SSR
  test.skip('render SSR', async () => {
    const response = await renderToString(
      <input
        type="checkbox"
        onClick$={[
          sync$(function (e: Event, target: Element) {
            if (target.getAttribute('shouldPreventDefault')) {
              e.preventDefault();
            }
            target.setAttribute('prevented', String(e.defaultPrevented));
          }),
        ]}
      />,
      { containerTagName: 'container' }
    );

    const { screen, userEvent } = await createDOM({ html: response.html });
    const input = screen.querySelector('input')!;
    await userEvent(input, 'click');
    assert.equal(input.getAttribute('prevented'), 'false');
    input.setAttribute('shouldPreventDefault', 'true');
    await userEvent(input, 'click');
    assert.equal(input.getAttribute('prevented'), 'true');
  });
});
