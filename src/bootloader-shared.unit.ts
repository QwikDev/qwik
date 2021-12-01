import { createDocument } from '@builder.io/qwik/testing';
import type { LoaderWindow } from './bootloader-shared';
import { qwikLoader, qrlResolver, setUpWebWorker } from './bootloader-shared';

describe('qwikloader', () => {
  describe('getModuleExport', () => {
    let doc: Document;
    let loaderWindow: LoaderWindow;

    beforeEach(() => {
      doc = createDocument();
      loaderWindow = {};
      (global as any).window = loaderWindow;
    });

    it('should throw error if missing named export', () => {
      expect(() => {
        const loader = qwikLoader(doc);
        const url = new URL('http://qwik.dev/event.js#someExport');
        const module = {};
        loader.getModuleExport(url, module);
      }).toThrowError(`QWIK: http://qwik.dev/event.js#someExport does not export someExport`);
    });

    it('should get named export w/ ?', () => {
      const loader = qwikLoader(doc);
      const url = new URL('http://qwik.dev/event.js#someExport?');
      const module = {
        someExport: () => {},
      };
      const handler = loader.getModuleExport(url, module);
      expect(handler).toBe(module.someExport);
    });

    it('should get named export', () => {
      const loader = qwikLoader(doc);
      const url = new URL('http://qwik.dev/event.js#someExport');
      const module = {
        someExport: () => {},
      };
      const handler = loader.getModuleExport(url, module);
      expect(handler).toBe(module.someExport);
    });

    it('should get default export w/  empty hash and ?', () => {
      const loader = qwikLoader(doc);
      const url = new URL('http://qwik.dev/event.js#?');
      const module = {
        default: () => {},
      };
      const handler = loader.getModuleExport(url, module);
      expect(handler).toBe(module.default);
    });

    it('should get default export w/ ?', () => {
      const loader = qwikLoader(doc);
      const url = new URL('http://qwik.dev/event.js?');
      const module = {
        default: () => {},
      };
      const handler = loader.getModuleExport(url, module);
      expect(handler).toBe(module.default);
    });

    it('should get default export w/ empty hash', () => {
      const loader = qwikLoader(doc);
      const url = new URL('http://qwik.dev/event.js#');
      const module = {
        default: () => {},
      };
      const handler = loader.getModuleExport(url, module);
      expect(handler).toBe(module.default);
    });

    it('should get default export, no hash', () => {
      const loader = qwikLoader(doc);
      const url = new URL('http://qwik.dev/event.js');
      const module = {
        default: () => {},
      };
      const handler = loader.getModuleExport(url, module);
      expect(handler).toBe(module.default);
    });

    it('should throw error if missing default export', () => {
      expect(() => {
        const loader = qwikLoader(doc);
        const url = new URL('http://qwik.dev/event.js');
        const module = {};
        loader.getModuleExport(url, module);
      }).toThrowError(`QWIK: http://qwik.dev/event.js does not export default`);
    });
  });

  describe('qrlResolver', () => {
    let doc: Document;
    beforeEach(() => {
      doc = createDocument();
    });

    it('should resolve full URL', () => {
      const div = doc.createElement('div');
      expect(String(qrlResolver(doc, div, 'http://foo.bar/baz'))).toEqual('http://foo.bar/baz');
    });

    it('should resolve relative URL against base', () => {
      const div = doc.createElement('div');
      expect(String(qrlResolver(doc, div, './bar'))).toEqual('http://document.qwik.dev/bar');
    });

    it('should resolve relative URL against q:base', () => {
      const div = doc.createElement('div');
      div.setAttribute('q:base', '../baz/');
      expect(String(qrlResolver(doc, div, './bar'))).toEqual('http://document.qwik.dev/baz/bar');
    });

    it('should resolve relative URL against nested q:base', () => {
      const div = doc.createElement('div');
      const parent = doc.createElement('parent');
      doc.body.appendChild(parent);
      parent.appendChild(div);
      parent.setAttribute('q:base', './parent/');
      div.setAttribute('q:base', './child/');
      expect(String(qrlResolver(doc, div, './bar'))).toEqual(
        'http://document.qwik.dev/parent/child/bar'
      );
    });

    it('do nothing for null/undefined/empty string', () => {
      const div = doc.createElement('div');
      expect(qrlResolver(doc, null, null)).toBeFalsy();
      expect(qrlResolver(doc, div, '')).toBeFalsy();
    });
  });

  describe('readystate', () => {
    let doc: any;
    beforeEach(() => {
      doc = createReadyStateTestDocument();
      (global as any).CustomEvent = class {};
    });
    afterEach(() => {
      delete (global as any).CustomEvent;
    });

    it('should query on:q-init if document complete', () => {
      doc.readyState = 'complete';
      const spy = jest.spyOn(doc, 'querySelectorAll');
      qwikLoader(doc);
      expect(spy).toHaveBeenCalledWith('[on\\:q-init]');
    });

    it('should query on:q-init if document interactive', () => {
      doc.readyState = 'interactive';
      const spy = jest.spyOn(doc, 'querySelectorAll');
      qwikLoader(doc);
      expect(spy).toHaveBeenCalledWith('[on\\:q-init]');
    });

    it('should not query on:q-init if document loading', () => {
      doc.readyState = 'loading';
      const spy = jest.spyOn(doc, 'querySelectorAll');
      qwikLoader(doc);
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

describe('prefetch', () => {
  describe('setUpWebWorker', () => {
    it('should listen on events and fire fetch', () => {
      let listener!: Function;
      const mockWindow: any = {
        addEventListener: (name: string, value: Function) => {
          expect(name).toEqual('message');
          listener = value;
        },
      };
      const mockFetch = jest.fn(() => ({
        headers: {
          get: () => '',
        },
      }));
      setUpWebWorker(mockWindow, mockFetch as any);
      listener({ data: 'somepath' });
      expect(mockFetch.mock.calls).toEqual([['somepath']]);
    });
  });
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
