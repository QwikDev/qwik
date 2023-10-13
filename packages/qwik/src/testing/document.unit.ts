import { createDocument, createWindow, ensureGlobals } from './document';
import { pathToFileURL } from 'node:url';
import { assert, test } from 'vitest';

test('should create document', () => {
  const win = createWindow({
    url: pathToFileURL(__filename),
  });
  assert.include(win.document.baseURI, 'file://');
  assert.include(win.document.baseURI, 'document.unit.ts');
});

test('noop history.go()', () => {
  const glb = ensureGlobals({ nodeType: 9 }, {});
  assert.doesNotThrow(() => {
    glb.history.go(1);
  });
});

test('noop history.back()', () => {
  const glb = ensureGlobals({ nodeType: 9 }, {});
  assert.doesNotThrow(() => {
    glb.history.back();
  });
});

test('noop history.forward()', () => {
  const glb = ensureGlobals({ nodeType: 9 }, {});
  assert.doesNotThrow(() => {
    glb.history.forward();
  });
});

test('noop history.replaceState()', () => {
  const glb = ensureGlobals({ nodeType: 9 }, {});
  assert.doesNotThrow(() => {
    glb.history.replaceState(null, '', '/url');
  });
});

test('noop history.pushState()', () => {
  const glb = ensureGlobals({ nodeType: 9 }, {});
  assert.doesNotThrow(() => {
    glb.history.pushState(null, '', '/url');
  });
});

test('noop addEventListener', () => {
  const glb = ensureGlobals({ nodeType: 9 }, {});
  assert.doesNotThrow(() => {
    glb.addEventListener('load', () => {});
  });
});

test('noop removeEventListener', () => {
  const glb = ensureGlobals({ nodeType: 9 }, {});
  assert.doesNotThrow(() => {
    glb.removeEventListener('load', () => {});
  });
});

test('baseURI', () => {
  const glb = ensureGlobals({ nodeType: 9 }, { url: 'http://my.qwik.dev/my-path' });
  assert.equal(glb.document.baseURI, 'http://my.qwik.dev/my-path');

  glb.document.baseURI = 'http://my.qwik.dev/new-path';
  assert.equal(glb.document.baseURI, 'http://my.qwik.dev/new-path');
});

test('location, no options', () => {
  const glb = ensureGlobals({ nodeType: 9 }, {});
  assert.equal(glb.location.pathname, '/');

  glb.location.pathname = '/new-path';
  assert.equal(glb.location.pathname, '/new-path');
});

test('location', () => {
  const glb = ensureGlobals({ nodeType: 9 }, { url: '/my-path' });
  assert.equal(glb.location.pathname, '/my-path');
});

test('origin, no options', () => {
  const glb = ensureGlobals({ nodeType: 9 }, {});
  assert.equal(glb.origin, 'http://document.qwik.dev');
});

test('origin', () => {
  const glb = ensureGlobals({ nodeType: 9 }, { url: '/my-path' });
  assert.equal(glb.origin, 'http://document.qwik.dev');
});

test('invalid document', () => {
  assert.throws(() => {
    ensureGlobals({}, {});
  });
});

test('qwik server createDocument()', () => {
  const doc = createDocument();
  assert.notEqual(doc.defaultView, undefined);
  assert.equal(doc.defaultView!.document, doc);
});

test('qwik server createWindow()', () => {
  const win = createWindow();
  assert.notEqual(win.document.defaultView, undefined);
  assert.equal(win.document.defaultView, win);
});

test('some other document', () => {
  const doc: any = {
    nodeType: 9,
  };
  ensureGlobals(doc, {});
  ensureGlobals(doc, {}); // shouldn't reset
  assert.notEqual(doc.defaultView, undefined);
  assert.equal(doc.defaultView.document, doc);
});
