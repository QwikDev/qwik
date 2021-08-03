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

    it('get protocol, trim ending slash', () => {
      const link = doc.createElement('link');
      link.setAttribute('rel', 'q.protocol.test');
      link.href = 'http://qwik.dev/test/';
      doc.head.appendChild(link);

      const url = qrlResolver(doc, 'test:/hi')!;
      expect(url.pathname).toBe('/test/hi.js');
    });

    it('get protocol', () => {
      const link = doc.createElement('link');
      link.setAttribute('rel', 'q.protocol.test');
      link.href = 'http://qwik.dev/test';
      doc.head.appendChild(link);

      const url = qrlResolver(doc, 'test:/hi')!;
      expect(url.pathname).toBe('/test/hi.js');
    });

    it('do nothing for null/undefined/empty string', () => {
      expect(qrlResolver(doc, null)).toBeFalsy();
      expect(qrlResolver(doc, undefined)).toBeFalsy();
      expect(qrlResolver(doc, '')).toBeFalsy();
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
      expect(spy).toHaveBeenCalledWith('[on\\:\\q-init]');
    });

    it('should query on:q-init if document interactive', () => {
      doc.readyState = 'interactive';
      const spy = jest.spyOn(doc, 'querySelectorAll');
      qwikLoader(doc);
      expect(spy).toHaveBeenCalledWith('[on\\:\\q-init]');
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
      const mockFetch = jest.fn(() => null);
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
