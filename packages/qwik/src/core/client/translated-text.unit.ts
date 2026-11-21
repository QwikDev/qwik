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
    const observers: {
      callback: MutationCallback;
      target?: Node;
      options?: MutationObserverInit;
    }[] = [];
    vi.stubGlobal(
      'MutationObserver',
      class {
        observer: (typeof observers)[number];
        constructor(callback: MutationCallback) {
          observers.push((this.observer = { callback }));
        }
        observe(target: Node, options: MutationObserverInit) {
          this.observer.target = target;
          this.observer.options = options;
        }
        disconnect() {
          this.observer.target = undefined;
        }
      }
    );
    const document = createDocument({ html: '<html><body><p>Hello</p></body></html>' });
    const html = document.documentElement;

    observeTranslatedText(document);
    observeTranslatedText(document);
    expect(observers).toHaveLength(1);
    expect(observers[0]).toMatchObject({ target: html, options: { attributeFilter: ['class'] } });

    html.className = 'translated-ltr';
    observers[0].callback([], null!);
    expect(observers[0].target).toBeUndefined();
    expect(observers[1]).toMatchObject({
      target: document,
      options: { childList: true, subtree: true },
    });

    const text = document.querySelector('p')!.firstChild!;
    const wrapper = document.createElement('font');
    wrapper.setAttribute('style', 'vertical-align: inherit;');
    observers[1].callback(
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
