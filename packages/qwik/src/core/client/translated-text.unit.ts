import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOriginalText,
  getTranslatedStandIn,
  observeTranslatedText,
  trackTranslatedText,
} from './translated-text';

describe('observeTranslatedText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts tracking text swaps once the translator marks the page', () => {
    const observed: { target: Node; options: MutationObserverInit }[] = [];
    let notify: MutationCallback = () => {};
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(callback: MutationCallback) {
          notify = callback;
        }
        observe(target: Node, options: MutationObserverInit) {
          observed.push({ target, options });
        }
      }
    );
    const document = createDocument({ html: '<html><body><p>Hello</p></body></html>' });
    const html = document.documentElement;

    observeTranslatedText(document);
    observeTranslatedText(document);
    expect(observed).toEqual([{ target: html, options: { attributeFilter: ['class'] } }]);

    html.className = 'translated-ltr';
    notify([], null!);
    expect(observed[1]).toEqual({ target: document, options: { childList: true, subtree: true } });

    const text = document.querySelector('p')!.firstChild!;
    const wrapper = document.createElement('font');
    wrapper.setAttribute('style', 'vertical-align: inherit;');
    notify(
      [{ removedNodes: [text], previousSibling: wrapper }] as unknown as MutationRecord[],
      null!
    );
    expect(getOriginalText(wrapper)).toBe('Hello');
  });
});

describe('trackTranslatedText', () => {
  it('ignores a text node that is removed after a known translation', () => {
    const document = createDocument();
    const wrapper = document.createElement('font');
    wrapper.setAttribute('style', 'vertical-align: inherit;');
    const translatedText = document.createTextNode('Hello');
    const nextText = document.createTextNode('world');
    trackTranslatedText([{ removedNodes: [translatedText] as any, previousSibling: wrapper }]);

    trackTranslatedText([{ removedNodes: [nextText] as any, previousSibling: wrapper }]);

    expect(getOriginalText(wrapper)).toBe('Hello');
    expect(getTranslatedStandIn(nextText)).toBeUndefined();
  });
});
