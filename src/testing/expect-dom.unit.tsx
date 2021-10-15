import { h } from '@builder.io/qwik';
import domino from 'domino';
import { expectDOM } from './expect-dom';

describe('expect-dom', () => {
  it('should match element', () => {
    expectDOM(toDOM('<span></span>'), <span></span>);
  });
  it('should match attributes element', () => {
    expectDOM(toDOM('<span title="abc" id="bar"></span>'), <span id="bar" title="abc"></span>);
  });

  describe('errors', () => {
    it('should detect missing attrs', () => {
      expectDOM(toDOM('<span></span>'), <span id="bar"></span>, [
        "span: expected '<span id=\"bar\">', was '<span>'.",
      ]);
    });
    it('should detect different tag attrs', () => {
      expectDOM(toDOM('<span></span>'), <div></div>, ["span: expected '<div>', was '<span>'."]);
    });
    it('should detect different text', () => {
      expectDOM(toDOM('<span>TEXT</span>'), <span>OTHER</span>, [
        'span: expected content "OTHER", was "TEXT"',
      ]);
    });
  });
});

function toDOM(html: string): HTMLElement {
  const doc = domino.createDocument();
  const host = doc.createElement('host');
  host.innerHTML = html;
  return host.firstElementChild! as HTMLElement;
}
