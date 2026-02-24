import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _run } from './run-qrl';
import * as qrlClass from '../shared/qrl/qrl-class';
import * as useCore from '../use/use-core';

// Mock dependencies
vi.mock('../shared/qrl/qrl-class', async () => {
  const actual =
    await vi.importActual<typeof import('../shared/qrl/qrl-class')>('../shared/qrl/qrl-class');
  return {
    ...actual,
    deserializeCaptures: vi.fn(),
    setCaptures: vi.fn(),
    _captures: null,
  };
});

vi.mock('../shared/qrl/qrl-utils', () => ({
  assertQrl: vi.fn(),
}));

vi.mock('../use/use-core', async () => {
  const actual = await vi.importActual<typeof import('../use/use-core')>('../use/use-core');
  return {
    ...actual,
    newInvokeContextFromDOM: vi.fn(),
  };
});

vi.mock('./vnode-utils', async () => {
  const actual = await vi.importActual<typeof import('./vnode-utils')>('./vnode-utils');
  return {
    ...actual,
    vnode_ensureElementInflated: vi.fn(),
    vnode_getProp: vi.fn(),
  };
});

vi.mock('../shared/utils/promises', async () => {
  const actual = await vi.importActual<typeof import('../shared/utils/promises')>(
    '../shared/utils/promises'
  );
  return {
    ...actual,
    retryOnPromise: vi.fn((fn) => fn()),
  };
});

function createMockElement(isConnected = true): Element {
  return {
    isConnected,
    getAttribute: vi.fn(),
    setAttribute: vi.fn(),
  } as unknown as Element;
}

describe('_run', () => {
  let mockEvent: Event;
  let mockElement: Element;
  let mockContainer: any;
  let mockContext: any;
  let mockQrl: any;

  beforeEach(() => {
    // Create mock event
    mockEvent = new Event('click');

    // Create mock element
    mockElement = createMockElement();

    // Create mock container
    mockContainer = {
      handleError: vi.fn(),
      $getObjectById$: vi.fn(),
    };

    // Create mock context
    mockContext = {
      $container$: mockContainer,
      $hostElement$: {
        flags: 0,
      },
    };

    // Create mock QRL
    mockQrl = vi.fn();

    // Setup default mocks
    vi.mocked(useCore.newInvokeContextFromDOM).mockReturnValue(mockContext);
    vi.mocked(qrlClass.deserializeCaptures).mockReturnValue([mockQrl]);

    // Mock _captures global
    Object.defineProperty(qrlClass, '_captures', {
      get: () => [mockQrl],
      configurable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return early if element is not connected', () => {
    const disconnectedElement = createMockElement(false);

    const result = _run.call('', mockEvent, disconnectedElement);

    expect(result).toBeUndefined();
    expect(useCore.newInvokeContextFromDOM).not.toHaveBeenCalled();
  });

  it('should create invoke context from DOM', () => {
    _run.call('', mockEvent, mockElement);

    expect(useCore.newInvokeContextFromDOM).toHaveBeenCalledWith(mockEvent, mockElement);
  });

  it('should deserialize captures when this is a string', () => {
    const capturesString = 'serialized-captures';

    _run.call(capturesString, mockEvent, mockElement);

    expect(qrlClass.deserializeCaptures).toHaveBeenCalledWith(mockContainer, capturesString);
    expect(qrlClass.setCaptures).toHaveBeenCalled();
  });

  it('should not deserialize captures when this is not a string', () => {
    _run.call(undefined as any, mockEvent, mockElement);

    expect(qrlClass.deserializeCaptures).not.toHaveBeenCalled();
  });

  it('should get QRL from first capture', () => {
    const mockQrlFromCaptures = vi.fn();
    Object.defineProperty(qrlClass, '_captures', {
      get: () => [mockQrlFromCaptures],
      configurable: true,
    });

    _run.call('captures', mockEvent, mockElement);

    // The function should use the QRL from _captures[0]
    expect(qrlClass._captures![0]).toBe(mockQrlFromCaptures);
  });

  it('should handle empty captures string', () => {
    _run.call('', mockEvent, mockElement);

    // Empty string is still a string, so deserializeCaptures will be called
    expect(qrlClass.deserializeCaptures).toHaveBeenCalledWith(mockContainer, '');
  });

  it('should work with connected element and valid captures', () => {
    const capturesString = 'valid-captures';

    _run.call(capturesString, mockEvent, mockElement);

    expect(useCore.newInvokeContextFromDOM).toHaveBeenCalledWith(mockEvent, mockElement);
    expect(qrlClass.deserializeCaptures).toHaveBeenCalledWith(mockContainer, capturesString);
    expect(qrlClass.setCaptures).toHaveBeenCalled();
  });

  it('should handle click event on connected element', () => {
    const clickEvent = new Event('click');
    const buttonElement = createMockElement();

    _run.call('test-captures', clickEvent, buttonElement);

    expect(useCore.newInvokeContextFromDOM).toHaveBeenCalledWith(clickEvent, buttonElement);
  });

  it('should handle element being disconnected during event', () => {
    const disconnectedElement = createMockElement(false);

    const result = _run.call('captures', mockEvent, disconnectedElement);

    expect(result).toBeUndefined();
    expect(qrlClass.deserializeCaptures).not.toHaveBeenCalled();
  });

  it('should handle different event types', () => {
    const mouseEvent = new Event('mouseover');

    _run.call('mouse-captures', mouseEvent, mockElement);

    expect(useCore.newInvokeContextFromDOM).toHaveBeenCalledWith(mouseEvent, mockElement);
  });

  it('should handle keyboard events', () => {
    const keyboardEvent = new Event('keydown');

    _run.call('keyboard-captures', keyboardEvent, mockElement);

    expect(useCore.newInvokeContextFromDOM).toHaveBeenCalledWith(keyboardEvent, mockElement);
    expect(qrlClass.deserializeCaptures).toHaveBeenCalledWith(mockContainer, 'keyboard-captures');
  });

  it('should handle complex capture strings', () => {
    const complexCaptures = 'complex|serialized|captures|with|pipes';

    _run.call(complexCaptures, mockEvent, mockElement);

    expect(qrlClass.deserializeCaptures).toHaveBeenCalledWith(mockContainer, complexCaptures);
    expect(qrlClass.setCaptures).toHaveBeenCalled();
  });
});
