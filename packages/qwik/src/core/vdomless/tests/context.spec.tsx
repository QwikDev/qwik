import { createContextId } from '@qwik.dev/core';
import {
  createContext,
  createContextProvider,
  createSignal,
  type Signal,
} from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { TypeIds } from '../../shared/serdes/constants';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender }, //
  { name: 'csrRender', render: csrRender }, //
])('$name: context', ({ name, render }) => {
  it('should provide and retrieve context', async () => {
    const MyComp = () => {
      const contextId = createContextId<Signal<string>>('context-integration');
      const source = createSignal('provided');
      createContextProvider(contextId, source);
      const context = createContext(contextId);

      return <p>{context.value}</p>;
    };

    const { container, cleanup } = await render(<MyComp />, { debug });

    expect(container.querySelector('p')?.textContent).toBe('provided');
    const comments = collectCommentData(container);
    if (name === 'ssrRender') {
      const marker = comments.find((comment) => /^c=\d+$/.test(comment));
      expect(marker).toBeDefined();
      expect(comments).toContain('/c');
      expect(getStateRootType(container, Number(marker!.slice(2)))).toBe(TypeIds.ContextScope);
    } else {
      expect(comments.some((comment) => /^c=\d+$/.test(comment))).toBe(false);
    }

    cleanup();
  });

  it('should keep retrieved context reactive', async () => {
    const MyComp = () => {
      const contextId = createContextId<Signal<string>>('context-reactive');
      const source = createSignal('before');
      createContextProvider(contextId, source);
      const context = createContext(contextId);

      return <button onClick$={() => (context.value = 'after')}>{context.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(<MyComp />, { debug });
    const button = container.querySelector('button');

    expect(button?.textContent).toBe('before');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('after');

    cleanup();
  });
});

const collectCommentData = (node: Node): string[] => {
  const comments: string[] = [];
  const visit = (current: Node): void => {
    if (current.nodeType === 8) {
      comments.push((current as Comment).data);
    }
    for (let child = current.firstChild; child !== null; child = child.nextSibling) {
      visit(child);
    }
  };
  visit(node);
  return comments;
};

const getStateRootType = (container: Element, rootId: number): unknown => {
  const scripts = container.querySelectorAll<HTMLScriptElement>('script[type="qwik/state"]');
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const base = Number(script.getAttribute('q:base'));
    const len = Number(script.getAttribute('q:len'));
    if (rootId >= base && rootId < base + len) {
      const state = JSON.parse(script.textContent || '[]') as unknown[];
      return state[(rootId - base) * 2];
    }
  }
  return undefined;
};
