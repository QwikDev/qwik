import { createDocument, createWindow } from '@builder.io/qwik/testing';
import { normalizeUrl } from './utils';
import { ensureGlobals } from './document';

describe('normalizeUrl', () => {
  it('no url', () => {
    expect(normalizeUrl(null).href).toBe('http://document.qwik.dev/');
    expect(normalizeUrl(undefined).href).toBe('http://document.qwik.dev/');
    expect(normalizeUrl('').href).toBe('http://document.qwik.dev/');
    expect(normalizeUrl({} as any).href).toBe('http://document.qwik.dev/');
  });

  it('string, full url', () => {
    const url = normalizeUrl('https://my.qwik.dev/some-path?query=string#hash');
    expect(url.pathname).toBe('/some-path');
    expect(url.hash).toBe('#hash');
    expect(url.searchParams.get('query')).toBe('string');
    expect(url.origin).toBe('https://my.qwik.dev');
    expect(url.href).toBe('https://my.qwik.dev/some-path?query=string#hash');
  });

  it('string, pathname', () => {
    const url = normalizeUrl('/some-path?query=string#hash');
    expect(url.pathname).toBe('/some-path');
    expect(url.hash).toBe('#hash');
    expect(url.searchParams.get('query')).toBe('string');
    expect(url.origin).toBe('http://document.qwik.dev');
    expect(url.href).toBe('http://document.qwik.dev/some-path?query=string#hash');
  });
});

describe('ensureGlobals', () => {
  it('noop history.go()', () => {
    const glb = ensureGlobals({ nodeType: 9 }, {});
    expect(() => {
      glb.history.go(1);
    }).not.toThrow();
  });

  it('noop history.back()', () => {
    const glb = ensureGlobals({ nodeType: 9 }, {});
    expect(() => {
      glb.history.back();
    }).not.toThrow();
  });

  it('noop history.forward()', () => {
    const glb = ensureGlobals({ nodeType: 9 }, {});
    expect(() => {
      glb.history.forward();
    }).not.toThrow();
  });

  it('noop history.replaceState()', () => {
    const glb = ensureGlobals({ nodeType: 9 }, {});
    expect(() => {
      glb.history.replaceState(null, '', '/url');
    }).not.toThrow();
  });

  it('noop history.pushState()', () => {
    const glb = ensureGlobals({ nodeType: 9 }, {});
    expect(() => {
      glb.history.pushState(null, '', '/url');
    }).not.toThrow();
  });

  it('noop addEventListener', () => {
    const glb = ensureGlobals({ nodeType: 9 }, {});
    expect(() => {
      glb.addEventListener('load', () => {});
    }).not.toThrow();
  });

  it('noop removeEventListener', () => {
    const glb = ensureGlobals({ nodeType: 9 }, {});
    expect(() => {
      glb.removeEventListener('load', () => {});
    }).not.toThrow();
  });

  it('baseURI', () => {
    const glb = ensureGlobals({ nodeType: 9 }, { url: 'http://my.qwik.dev/my-path' });
    expect(glb.document.baseURI).toBe('http://my.qwik.dev/my-path');

    glb.document.baseURI = 'http://my.qwik.dev/new-path';
    expect(glb.document.baseURI).toBe('http://my.qwik.dev/new-path');
  });

  it('location, no options', () => {
    const glb = ensureGlobals({ nodeType: 9 }, {});
    expect(glb.location.pathname).toBe('/');

    glb.location.pathname = '/new-path';
    expect(glb.location.pathname).toBe('/new-path');
  });

  it('location', () => {
    const glb = ensureGlobals({ nodeType: 9 }, { url: '/my-path' });
    expect(glb.location.pathname).toBe('/my-path');
  });

  it('origin, no options', () => {
    const glb = ensureGlobals({ nodeType: 9 }, {});
    expect(glb.origin).toBe('http://document.qwik.dev');
  });

  it('origin', () => {
    const glb = ensureGlobals({ nodeType: 9 }, { url: '/my-path' });
    expect(glb.origin).toBe('http://document.qwik.dev');
  });

  it('invalid document', () => {
    expect(() => {
      ensureGlobals({}, {});
    }).toThrow();
  });
});

describe('document ensureGlobals', () => {
  it('qwik server createDocument()', () => {
    const doc = createDocument();
    expect(doc.defaultView).not.toBeUndefined();
    expect(doc.defaultView!.document).toBe(doc);
  });

  it('qwik server createWindow()', () => {
    const win = createWindow();
    expect(win.document.defaultView).not.toBeUndefined();
    expect(win.document.defaultView).toBe(win);
  });

  it('some other document', () => {
    const doc: any = {
      nodeType: 9,
    };
    ensureGlobals(doc, {});
    ensureGlobals(doc, {}); // shouldn't reset
    expect(doc.defaultView).not.toBeUndefined();
    expect(doc.defaultView.document).toBe(doc);
  });
});
