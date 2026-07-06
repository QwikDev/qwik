import {
  component$,
  getDomContainer,
  getPlatform,
  setPlatform,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';
import { renderToString } from '@qwik.dev/core/server';
import {
  createDocument,
  emulateExecutionOfQwikFuncs,
  getTestPlatform,
  trigger,
} from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { whenContainerDataReady } from '../client/dom-container';
import type { _ContainerElement } from '../internal';
import { QContainerSelector } from '../shared/utils/markers';

const renderToStringAndSetPlatform = async (jsx: JSXOutput) => {
  const platform = getPlatform();
  try {
    return await renderToString(jsx, { qwikLoader: 'never', containerTagName: 'div' });
  } finally {
    setPlatform(platform);
  }
};

describe('multiple SSR containers resumed on one page', () => {
  it('resumes container B after A is already resumed', async () => {
    setPlatform(getTestPlatform());

    const Counter = component$((props: { testId: string }) => {
      const count = useSignal(0);
      return (
        <button data-testid={props.testId} onClick$={() => count.value++}>
          Count: {count.value}!
        </button>
      );
    });

    // 1. Render + resume container A in its own document.
    const aResult = await renderToStringAndSetPlatform(<Counter testId="a" />);
    const document = createDocument({ html: aResult.html });
    emulateExecutionOfQwikFuncs(document);
    const aElement = document.querySelector(QContainerSelector) as _ContainerElement;
    const aContainer = getDomContainer(aElement);
    await whenContainerDataReady(aContainer, () => undefined);

    // 2. Render container B separately, then inject it into the SAME document AFTER A resumed.
    const bResult = await renderToStringAndSetPlatform(<Counter testId="b" />);
    const bDocument = createDocument({ html: bResult.html });
    const bElement = bDocument.querySelector(QContainerSelector) as _ContainerElement;
    document.body.appendChild(document.importNode(bElement, true));

    // 3. Resume container B (its qfuncs + real DomContainer + processVNodeData).
    emulateExecutionOfQwikFuncs(document);
    const bElementInDoc = document.body
      .querySelector(`${QContainerSelector} [data-testid="b"]`)!
      .parentElement!.closest(QContainerSelector) as _ContainerElement;
    const bContainer = getDomContainer(bElementInDoc);
    await whenContainerDataReady(bContainer, () => undefined);

    // 4. Interact with B — forces vnode_locate into B (throws "Missing qVNodeRefs" on the bug).
    await trigger(bContainer.element, '[data-testid="b"]', 'click');
    expect(document.querySelector('[data-testid="b"]')!.textContent).toBe('Count: 1!');

    // A must still be live.
    await trigger(aContainer.element, '[data-testid="a"]', 'click');
    expect(document.querySelector('[data-testid="a"]')!.textContent).toBe('Count: 1!');
  });
});
