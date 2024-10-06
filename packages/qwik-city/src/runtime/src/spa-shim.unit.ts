import { assert, test, vi, beforeEach } from 'vitest';
import * as spaShimModule from './spa-shim';

vi.mock('./spa-shim', async (importOriginal) => {
  const mod = (await importOriginal()) as typeof spaShimModule;
  return {
    ...mod,
    isDev: false,
    shim: vi.fn(mod.shim),
  };
});

const mockSPAInitModule = {
  spaInit: vi.fn(),
};

vi.mock('http://localhost:3000/test-bundle.js', () => mockSPAInitModule);

const { shim } = spaShimModule;

const mockWindow: any = {
  scrollTo: vi.fn(),
  _qcs: undefined,
};

const mockHistory: any = {
  scrollRestoration: 'manual',
  state: {
    _qCityScroll: { x: 100, y: 200 },
  },
};

const mockDocument: any = {
  currentScript: {
    closest: vi.fn(),
  },
  baseURI: 'http://localhost:3000',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockWindow._qcs = undefined;
  mockHistory.scrollRestoration = 'manual';

  global.window = mockWindow;
  global.history = mockHistory;
  global.document = mockDocument;

  vi.mocked(mockSPAInitModule).spaInit.mockClear();
});

test('shim function initializes SPA and restores scroll position', async () => {
  const mockQwikContainer = { id: 'mock-qwik-container' };
  mockDocument.currentScript.closest.mockReturnValue(mockQwikContainer);

  const spaInitSymbol = 'spaInit';

  await shim('/', 'test-bundle.js', spaInitSymbol);

  assert.equal(mockWindow._qcs, true);
  assert.equal(mockWindow.scrollTo.mock.calls.length, 1);
  assert.deepEqual(mockWindow.scrollTo.mock.calls[0], [100, 200]);
  assert.equal(mockDocument.currentScript.closest.mock.calls.length, 1);
  assert.equal(mockDocument.currentScript.closest.mock.calls[0][0], '[q\\:container]');

  assert.equal(mockSPAInitModule.spaInit.mock.calls.length, 1);
  assert.equal(mockSPAInitModule.spaInit.mock.calls[0][0], mockQwikContainer);
});

test('shim function does not initialize SPA if already initialized', async () => {
  mockWindow._qcs = true;

  await shim('/', 'test-bundle.js', 'spaInit');

  assert.equal(mockWindow.scrollTo.mock.calls.length, 0);
  assert.equal(mockDocument.currentScript.closest.mock.calls.length, 0);
  assert.equal(mockSPAInitModule.spaInit.mock.calls.length, 0);
});

test('shim function does not initialize SPA if scrollRestoration is not manual', async () => {
  mockHistory.scrollRestoration = 'auto';

  await shim('/', 'test-bundle.js', 'spaInit');

  assert.equal(mockWindow._qcs, undefined);
  assert.equal(mockWindow.scrollTo.mock.calls.length, 0);
  assert.equal(mockDocument.currentScript.closest.mock.calls.length, 0);
  assert.equal(mockSPAInitModule.spaInit.mock.calls.length, 0);
});
