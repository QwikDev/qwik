import { component$, useContextProvider, useStore, type RenderRoot } from '@qwik.dev/core';
import { createDOM, trigger } from '@qwik.dev/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentHeadContext } from './contexts';
import { DocumentHeadTags } from './document-head-tags-component';
import { createDocumentHead } from './head';

const debug = false;
const renderCleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of renderCleanups.splice(0)) {
    cleanup();
  }
});

/** The router's head store plus a button that changes it the way a navigation does. */
const Root = component$(() => {
  const head = useStore(
    createDocumentHead({ title: 'First', meta: [{ name: 'hello', content: 'one' }] }),
    { deep: false }
  );
  useContextProvider(DocumentHeadContext, head);
  return (
    <>
      <button
        onClick$={() => {
          head.title = 'Second';
          head.meta = [{ name: 'hello', content: 'two' }];
        }}
      >
        navigate
      </button>
      <DocumentHeadTags />
    </>
  );
});

const renderRoot = async (root: RenderRoot<undefined>) => {
  const harness = await createDOM();
  renderCleanups.push(harness.cleanup);
  return harness.render(root, { debug });
};

describe('DocumentHeadTags', () => {
  it('re-renders the title and meta when the head store changes', async () => {
    const { document } = await renderRoot(Root);
    expect(document.body.querySelector('title')?.textContent).toBe('First');
    expect(document.body.querySelector('meta[name="hello"]')?.getAttribute('content')).toBe('one');

    await trigger(document.body, 'button', 'click');

    expect(document.body.querySelector('title')?.textContent).toBe('Second');
    expect(document.body.querySelector('meta[name="hello"]')?.getAttribute('content')).toBe('two');
  });
});
