import { createDocument } from './testing/document';
import { describe, expect, it } from 'vitest';
import { installErrorSwapExecutor } from './error-swap-executor-shared';

describe('error-swap executor (qErr)', () => {
  const setup = (html: string) => {
    const document = createDocument({ html });
    installErrorSwapExecutor(document as unknown as Document);
    return document;
  };
  const displayOf = (el: Element | null) => (el as HTMLElement | null)?.style?.display;

  it('hides the content-host and reveals the fallback-host for the given id', () => {
    const document = setup(
      `<div q:container="resumed" q:render="dom-ssr">
        <div q:ebc="1" style="display:contents"><p id="content">partial</p></div>
        <div q:ebf="1" style="display:none"><p id="fb">fallback</p></div>
      </div>`
    );
    (globalThis as any).qErr(1);
    expect(displayOf(document.querySelector('[q\\:ebc="1"]'))).toBe('none');
    expect(displayOf(document.querySelector('[q\\:ebf="1"]'))).toBe('contents');
  });

  it('only swaps the matching boundary id', () => {
    const document = setup(
      `<div q:container="resumed" q:render="dom-ssr">
        <div q:ebc="1" style="display:contents"></div>
        <div q:ebf="1" style="display:none"></div>
        <div q:ebc="2" style="display:contents"></div>
        <div q:ebf="2" style="display:none"></div>
      </div>`
    );
    (globalThis as any).qErr(2);
    expect(displayOf(document.querySelector('[q\\:ebc="1"]'))).toBe('contents');
    expect(displayOf(document.querySelector('[q\\:ebf="1"]'))).toBe('none');
    expect(displayOf(document.querySelector('[q\\:ebc="2"]'))).toBe('none');
    expect(displayOf(document.querySelector('[q\\:ebf="2"]'))).toBe('contents');
  });

  it('strips document and window handlers from the hidden content', () => {
    const document = setup(
      `<div q:container="resumed" q:render="dom-ssr">
        <div q:ebc="1" style="display:contents">
          <p id="dead" q-d:click="chunk#h" q-w:resize="chunk#h" q-e:click="chunk#h">partial</p>
        </div>
        <div q:ebf="1" style="display:none"><p id="fb">fallback</p></div>
        <p id="outside" q-d:click="chunk#h">outside</p>
      </div>`
    );
    (globalThis as any).qErr(1);
    const dead = document.querySelector('#dead')!;
    expect(dead.hasAttribute('q-d:click')).toBe(false);
    expect(dead.hasAttribute('q-w:resize')).toBe(false);
    // Element-scoped handlers cannot fire on a hidden node, so leave them alone.
    expect(dead.hasAttribute('q-e:click')).toBe(true);
    expect(document.querySelector('#outside')!.hasAttribute('q-d:click')).toBe(true);
  });

  it('marks the document so a second install short-circuits', () => {
    const document = setup(`<div q:container="resumed"></div>`);
    expect((globalThis as any).qErr.d).toBe(document);
  });
});
