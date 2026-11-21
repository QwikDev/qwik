import { component$, useSignal } from '@qwik.dev/core';
import { ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { captureOriginalTexts, trackTranslatedText } from '../client/translated-text';

type TextSwap = Pick<MutationRecord, 'removedNodes' | 'previousSibling'>;

/** Replaces every text node the way Google Translate does, returning what an observer would see. */
const translate = (document: Document): TextSwap[] => {
  const swaps: TextSwap[] = [];
  const walk = (element: Element) => {
    const children = Array.from(element.childNodes);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 3 && child.nodeValue!.trim()) {
        const wrapper = document.createElement('font');
        wrapper.setAttribute('style', 'vertical-align: inherit;');
        const inner = wrapper.cloneNode() as Element;
        inner.textContent = `[${child.nodeValue}]`;
        wrapper.appendChild(inner);
        element.insertBefore(wrapper, child);
        element.removeChild(child);
        swaps.push({ removedNodes: [child] as any, previousSibling: wrapper });
      } else if (child.nodeType === 1 && !['SCRIPT', 'FONT'].includes(child.nodeName)) {
        // The translator does not translate its own wrappers again.
        walk(child as Element);
      }
    }
  };
  walk(document.body);
  return swaps;
};

/** Puts the original text nodes back, like the translator's "show original". */
const showOriginal = (swaps: TextSwap[]): TextSwap[] =>
  swaps.map(({ removedNodes: [text], previousSibling: wrapper }) => {
    wrapper!.parentNode!.insertBefore(text, wrapper);
    wrapper!.parentNode!.removeChild(wrapper!);
    return { removedNodes: [wrapper] as any, previousSibling: text };
  });

const Sentence = component$((props: { canRerender?: boolean }) => {
  const count = useSignal(5);
  const renders = useSignal(0);
  // The server only serializes a component that a signal can render again.
  props.canRerender && renders.value;
  return (
    <div>
      <button id="count" onClick$={() => count.value++}></button>
      <button id="render" onClick$={() => renders.value++}></button>
      <p>You clicked {count.value} times.</p>
    </div>
  );
});

describe('translated text', () => {
  describe('translated before resume', () => {
    it('updates a signal inside a translated sentence', async () => {
      const { container, document } = await ssrRenderToDom(<Sentence canRerender />, {
        onBeforeResume: translate,
      });
      expect(document.querySelector('p')!.textContent).toBe('[You clicked 5 times.]');
      await trigger(container.element, '#count', 'click');
      expect(document.querySelector('p')!.innerHTML).toBe('You clicked 6 times.');
    });

    it('keeps the translated sentence when its component can not render again', async () => {
      const { container, document } = await ssrRenderToDom(<Sentence />, {
        onBeforeResume: translate,
      });
      await trigger(container.element, '#count', 'click');
      expect(document.querySelector('p')!.textContent).toBe('6[You clicked 5 times.]');
    });

    it('updates a signal that is the only text of its element', async () => {
      const Cmp = component$(() => {
        const count = useSignal(5);
        return (
          <div>
            <button onClick$={() => count.value++}></button>
            <p>{count.value}</p>
          </div>
        );
      });
      const { container, document } = await ssrRenderToDom(<Cmp />, { onBeforeResume: translate });
      await trigger(container.element, 'button', 'click');
      expect(document.querySelector('p')!.innerHTML).toBe('6');
    });

    it('removes a conditional text when it becomes empty', async () => {
      const Cmp = component$(() => {
        const show = useSignal(true);
        return (
          <div>
            <button onClick$={() => (show.value = false)}></button>
            <p>
              {show.value ? 'conditional' : ''}
              <b></b>
            </p>
          </div>
        );
      });
      const { container, document } = await ssrRenderToDom(<Cmp />, { onBeforeResume: translate });
      await trigger(container.element, 'button', 'click');
      expect(document.querySelector('p')!.textContent).toBe('');
    });

    it('inserts an element in front of translated text', async () => {
      const Cmp = component$(() => {
        const show = useSignal(false);
        return (
          <div>
            <button onClick$={() => (show.value = true)}></button>
            <p>
              {show.value && <b>new</b>}
              tail text
            </p>
          </div>
        );
      });
      const { container, document } = await ssrRenderToDom(<Cmp />, { onBeforeResume: translate });
      await trigger(container.element, 'button', 'click');
      const p = document.querySelector('p')!;
      expect(p.textContent).toBe('newtail text');
      expect(p.firstElementChild!.nodeName).toBe('B');
    });

    it('rewrites the text of a re-rendered list', async () => {
      const Cmp = component$(() => {
        const items = useSignal(['apple', 'banana']);
        return (
          <div>
            <button onClick$={() => (items.value = ['banana', 'apple'])}></button>
            <ul>
              {items.value.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        );
      });
      const { container, document } = await ssrRenderToDom(<Cmp />, { onBeforeResume: translate });
      await trigger(container.element, 'button', 'click');
      expect(Array.from(document.querySelectorAll('li'), (li) => li.innerHTML)).toEqual([
        'banana',
        'apple',
      ]);
    });

    it('rewrites the text of a child component that shares a translated sentence', async () => {
      const Label = component$((props: { text: string }) => <>{props.text}</>);
      const Cmp = component$(() => {
        const count = useSignal(5);
        const renders = useSignal(0);
        renders.value;
        return (
          <div>
            <button id="count" onClick$={() => count.value++}></button>
            <button id="render" onClick$={() => renders.value++}></button>
            <p>
              Count {count.value} <Label text="label" />
            </p>
          </div>
        );
      });
      const { container, document } = await ssrRenderToDom(<Cmp />, { onBeforeResume: translate });
      await trigger(container.element, '#count', 'click');
      expect(document.querySelector('p')!.innerHTML).toBe('Count 6 label');
    });

    it('follows text that the translator restored', async () => {
      const Cmp = component$(() => {
        const count = useSignal(5);
        const show = useSignal(true);
        return (
          <div>
            <button id="count" onClick$={() => count.value++}></button>
            <button id="hide" onClick$={() => (show.value = false)}></button>
            <p>
              {count.value}
              <b></b>
              {show.value ? 'tail text' : ''}
            </p>
          </div>
        );
      });
      let swaps: TextSwap[] = [];
      const { container, document } = await ssrRenderToDom(<Cmp />, {
        onBeforeResume: (document) => (swaps = translate(document)),
      });
      await trigger(container.element, '#count', 'click');
      trackTranslatedText(showOriginal(swaps.filter((swap) => swap.previousSibling!.parentNode)));
      await trigger(container.element, '#hide', 'click');
      expect(document.querySelector('p')!.textContent).toBe('6');
    });
  });

  describe('translated before resume, seen by the preloader', () => {
    /** The preloader only records the text that each wrapper replaced. */
    const translateAndRecord = (document: Document) => {
      const swaps = translate(document);
      captureOriginalTexts(swaps);
      return swaps;
    };

    it('rewrites a sentence whose component can not render again', async () => {
      const { container, document } = await ssrRenderToDom(<Sentence />, {
        onBeforeResume: translateAndRecord,
      });
      await trigger(container.element, '#count', 'click');
      expect(document.querySelector('p')!.innerHTML).toBe('You clicked 6 times.');
    });

    it('updates a signal at the end of a translated sentence', async () => {
      const Cmp = component$(() => {
        const count = useSignal(5);
        return (
          <div>
            <button onClick$={() => count.value++}></button>
            <p>Count {count.value}</p>
          </div>
        );
      });
      const { container, document } = await ssrRenderToDom(<Cmp />, {
        onBeforeResume: translateAndRecord,
      });
      await trigger(container.element, 'button', 'click');
      expect(document.querySelector('p')!.innerHTML).toBe('Count 6');
      await trigger(container.element, 'button', 'click');
      expect(document.querySelector('p')!.innerHTML).toBe('Count 7');
    });

    it('rewrites a sentence that the translator restored', async () => {
      const Cmp = component$(() => {
        const count = useSignal(5);
        const other = useSignal(1);
        return (
          <div>
            <button id="count" onClick$={() => count.value++}></button>
            <button id="other" onClick$={() => other.value++}></button>
            <p>
              {other.value}
              <b></b>
              Count {count.value} left
            </p>
          </div>
        );
      });
      let swaps: TextSwap[] = [];
      const { container, document } = await ssrRenderToDom(<Cmp />, {
        onBeforeResume: (document) => (swaps = translateAndRecord(document)),
      });
      await trigger(container.element, '#other', 'click');
      trackTranslatedText(showOriginal(swaps.filter((swap) => swap.previousSibling!.parentNode)));
      await trigger(container.element, '#count', 'click');
      expect(document.querySelector('p')!.textContent).toBe('2Count 6 left');
    });
  });

  describe('translated after render', () => {
    it('updates a signal inside a translated sentence', async () => {
      const { container, document } = await ssrRenderToDom(<Sentence />);
      await trigger(container.element, '#count', 'click');
      trackTranslatedText(translate(document));
      await trigger(container.element, '#count', 'click');
      expect(document.querySelector('p')!.textContent).toBe('[You clicked ]7[ times.]');
    });

    it('does not write into a text node that the translator took again', async () => {
      const { container, document } = await ssrRenderToDom(<Sentence />);
      await trigger(container.element, '#count', 'click');
      trackTranslatedText(translate(document));
      await trigger(container.element, '#count', 'click');
      // The translator translates the updated text too, and keeps that node to restore it later.
      const swaps = translate(document);
      trackTranslatedText(swaps);
      const heldByTranslator = swaps.map((swap) => swap.removedNodes[0]);
      expect(heldByTranslator.map((node) => node.nodeValue)).toContain('7');

      await trigger(container.element, '#count', 'click');

      expect(document.querySelector('p')!.textContent).toBe('[You clicked ]8[ times.]');
      expect(heldByTranslator.filter((node) => node.parentNode)).toEqual([]);
    });

    it('updates text that the translator restored', async () => {
      const { container, document } = await ssrRenderToDom(<Sentence />);
      await trigger(container.element, '#count', 'click');
      const swaps = translate(document);
      trackTranslatedText(swaps);
      trackTranslatedText(showOriginal(swaps));
      await trigger(container.element, '#count', 'click');
      expect(document.querySelector('p')!.innerHTML).toBe('You clicked 7 times.');
    });
  });
});
