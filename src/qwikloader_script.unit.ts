import type { LoaderWindow } from './qwikloader_script';
import { qwikLoader } from './qwikloader_script';
import { createDocument } from '@builder.io/qwik/testing';

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

  describe('getModuleUrl', () => {
    let doc: Document;
    beforeEach(() => {
      doc = createDocument();
    });

    it('get protocol, trim ending slash', () => {
      const link = doc.createElement('link');
      link.setAttribute('rel', 'q.protocol.test');
      link.href = 'http://qwik.dev/test/';
      doc.head.appendChild(link);

      const loader = qwikLoader(doc);
      const url = loader.getModuleUrl('test:/hi')!;
      expect(url.pathname).toBe('/test/hi');
    });

    it('get protocol', () => {
      const link = doc.createElement('link');
      link.setAttribute('rel', 'q.protocol.test');
      link.href = 'http://qwik.dev/test';
      doc.head.appendChild(link);

      const loader = qwikLoader(doc);
      const url = loader.getModuleUrl('test:/hi')!;
      expect(url.pathname).toBe('/test/hi');
    });

    it('do nothing for null/undefined/empty string', () => {
      const loader = qwikLoader(doc);
      expect(loader.getModuleUrl(null)).toBeFalsy();
      expect(loader.getModuleUrl(undefined)).toBeFalsy();
      expect(loader.getModuleUrl('')).toBeFalsy();
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

function createReadyStateTestDocument() {
  const doc = {
    readyState: 'complete',
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return doc;
}
