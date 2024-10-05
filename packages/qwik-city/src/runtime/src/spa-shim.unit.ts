import { assert, test, vi, beforeEach } from 'vitest';
import { shim } from './spa-shim';

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

vi.mock('URL', () => {
  return {
    URL: vi.fn().mockImplementation(() => ({
      href: 'http://localhost:3000/test-bundle.js',
    })),
  };
});

global.window = mockWindow;
global.history = mockHistory;
global.document = mockDocument;

beforeEach(() => {
  vi.clearAllMocks();
  mockWindow._qcs = undefined;
});

test('shim function sets _qcs and scrolls to saved position', async () => {
  const mockContainer = { id: 'mock-container' };
  mockDocument.currentScript.closest.mockReturnValue(mockContainer);

  const mockSymbol = 'testSymbol';
  const mockModule = {
    [mockSymbol]: vi.fn(),
  };

  vi.mock('http://localhost:3000/test-bundle.js', () => ({
    default: mockModule,
  }));

  await shim('/', 'test-bundle.js', mockSymbol);

  assert.equal(mockWindow._qcs, true);
  assert.equal(mockWindow.scrollTo.mock.calls.length, 1);
  assert.deepEqual(mockWindow.scrollTo.mock.calls[0], [100, 200]);
  assert.equal(mockDocument.currentScript.closest.mock.calls.length, 1);
  assert.equal(mockDocument.currentScript.closest.mock.calls[0][0], '[q\\:container]');
  assert.equal(mockModule[mockSymbol].mock.calls.length, 1);
  assert.equal(mockModule[mockSymbol].mock.calls[0][0], mockContainer);
});

test('shim function does not run if _qcs is already set', async () => {
  mockWindow._qcs = true;

  await shim('/', 'test-bundle.js', 'testSymbol');

  assert.equal(mockWindow.scrollTo.mock.calls.length, 0);
  assert.equal(mockDocument.currentScript.closest.mock.calls.length, 0);
});

test('shim function does not run if scrollRestoration is not manual', async () => {
  mockHistory.scrollRestoration = 'auto';

  await shim('/', 'test-bundle.js', 'testSymbol');

  assert.equal(mockWindow._qcs, undefined);
  assert.equal(mockWindow.scrollTo.mock.calls.length, 0);
  assert.equal(mockDocument.currentScript.closest.mock.calls.length, 0);
});
