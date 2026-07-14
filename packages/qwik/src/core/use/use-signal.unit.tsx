import { assert, describe, test } from 'vitest';
import { component$ } from '../component/component.public';
import { createDOM } from '../../testing/library';
import { useConstant, useSignal } from './use-signal';

describe('useConstant', () => {
  test('retains a null result but re-runs an undefined result', async () => {
    let nullCalls = 0;
    let undefinedCalls = 0;

    const Cmp = component$(() => {
      // Reading the signal during render subscribes the component so that a
      // click re-executes the component and re-invokes `useConstant`.
      const rerender = useSignal(0);
      const nullConst = useConstant((): null => {
        nullCalls++;
        return null;
      });
      const undefinedConst = useConstant((): undefined => {
        undefinedCalls++;
        return undefined;
      });
      return (
        <button onClick$={() => rerender.value++}>
          {rerender.value}|{String(nullConst)}|{String(undefinedConst)}
        </button>
      );
    });

    const { render, userEvent } = await createDOM();
    await render(<Cmp />);

    // First render: both factories run exactly once.
    assert.equal(nullCalls, 1);
    assert.equal(undefinedCalls, 1);

    // Force a re-render.
    await userEvent('button', 'click');

    // A `null` result is retained (the factory is not re-run), while an
    // `undefined` result causes the factory to re-run on every render.
    assert.equal(nullCalls, 1);
    assert.equal(undefinedCalls, 2);

    // A second re-render confirms the behavior is stable.
    await userEvent('button', 'click');
    assert.equal(nullCalls, 1);
    assert.equal(undefinedCalls, 3);
  });
});
