import { createDocument } from './testing/index';
import { qwikLoader } from './qwikloader';
import { equal, throws } from 'uvu/assert';
import { suite } from 'uvu';
import { snoop } from 'snoop';

const loaderWindow = {
  BuildEvents: false,
  qEvents: [],
};
(global as any).window = loaderWindow;

const qwikLoaderSuite = suite('qwikloader');
// let doc: Document;
// let loaderWindow: LoaderWindow;

// beforeEach(() => {
//   doc = createDocument();
//   loaderWindow = {
//     BuildEvents: false,
//     qEvents: [],
//   };
//   (global as any).window = loaderWindow;
// });

qwikLoaderSuite('getModuleExport, should throw error if missing named export', () => {
  throws(() => {
    const doc = createDocument();
    const loader = qwikLoader(doc);
    const url = new URL('http://qwik.dev/event.js#someExport');
    const module = {};
    loader.getModuleExport(url, module);
  }, `QWIK http://qwik.dev/event.js#someExport does not export someExport`);
});

qwikLoaderSuite('should get named export w/ ?', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const url = new URL('http://qwik.dev/event.js#someExport?');
  const module = {
    someExport: () => {},
  };
  const handler = loader.getModuleExport(url, module);
  equal(handler, module.someExport);
});

qwikLoaderSuite('should get named export', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const url = new URL('http://qwik.dev/event.js#someExport');
  const module = {
    someExport: () => {},
  };
  const handler = loader.getModuleExport(url, module);
  equal(handler, module.someExport);
});

qwikLoaderSuite('should get default export w/  empty hash and ?', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const url = new URL('http://qwik.dev/event.js#?');
  const module = {
    default: () => {},
  };
  const handler = loader.getModuleExport(url, module);
  equal(handler, module.default);
});

qwikLoaderSuite('should get default export w/ ?', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const url = new URL('http://qwik.dev/event.js?');
  const module = {
    default: () => {},
  };
  const handler = loader.getModuleExport(url, module);
  equal(handler, module.default);
});

qwikLoaderSuite('should get default export w/ empty hash', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const url = new URL('http://qwik.dev/event.js#');
  const module = {
    default: () => {},
  };
  const handler = loader.getModuleExport(url, module);
  equal(handler, module.default);
});

qwikLoaderSuite('should get default export, no hash', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const url = new URL('http://qwik.dev/event.js');
  const module = {
    default: () => {},
  };
  const handler = loader.getModuleExport(url, module);
  equal(handler, module.default);
});

qwikLoaderSuite('should throw error if missing default export', () => {
  const doc = createDocument();
  throws(() => {
    const loader = qwikLoader(doc);
    const url = new URL('http://qwik.dev/event.js');
    const module = {};
    loader.getModuleExport(url, module);
  }, `QWIK http://qwik.dev/event.js does not export default`);
});

qwikLoaderSuite('should resolve full URL', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const div = doc.createElement('div');
  equal(String(loader.qrlResolver(div, 'http://foo.bar/baz')), 'http://foo.bar/baz');
});

qwikLoaderSuite('should resolve relative URL against base', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const div = doc.createElement('div');
  const resolvedQrl = loader.qrlResolver(div, './bar');
  equal(resolvedQrl.href, 'http://document.qwik.dev/bar');
});

qwikLoaderSuite('should resolve relative URL against q:base', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const div = doc.createElement('div');
  div.setAttribute('q:container', '');
  div.setAttribute('q:base', '/baz/');
  const resolvedQrl = loader.qrlResolver(div, './bar');
  equal(resolvedQrl.href, 'http://document.qwik.dev/baz/bar');
});

qwikLoaderSuite('should resolve relative URL against nested q:base', () => {
  const doc = createDocument();
  const loader = qwikLoader(doc);
  const div = doc.createElement('div');
  const parent = doc.createElement('parent');
  doc.body.appendChild(parent);
  parent.appendChild(div);
  parent.setAttribute('q:container', '');
  parent.setAttribute('q:base', './parent/');
  const resolvedQrl = loader.qrlResolver(div, './bar');
  equal(resolvedQrl.href, 'http://document.qwik.dev/parent/bar');
});

const readystate = suite('readystate');
readystate.before(() => {
  (global as any).CustomEvent = class {};
});
readystate.after(() => {
  delete (global as any).CustomEvent;
});

readystate('should query on:qvisible document complete', () => {
  const doc = createReadyStateTestDocument();
  doc.readyState = 'complete';

  const spy = snoop(doc.querySelectorAll);
  doc.querySelectorAll = spy.fn;

  qwikLoader(doc as any);
  equal(spy.lastCall.arguments, ['[on\\:qvisible]']);
});

readystate('should query on:qvisible if document interactive', () => {
  const doc = createReadyStateTestDocument();
  doc.readyState = 'interactive';
  const spy = snoop(doc.querySelectorAll);
  doc.querySelectorAll = spy.fn;

  qwikLoader(doc as any);
  equal(spy.lastCall.arguments, ['[on\\:qvisible]']);
});

readystate('should not query on:qinit if document loading', () => {
  const doc = createReadyStateTestDocument();
  doc.readyState = 'loading';
  const spy = snoop(doc.querySelectorAll);
  doc.querySelectorAll = spy.fn;

  qwikLoader(doc as any);
  equal(spy.called, false);
});

function createReadyStateTestDocument() {
  const doc = {
    readyState: 'complete',
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return doc;
}

qwikLoaderSuite.run();
readystate.run();
