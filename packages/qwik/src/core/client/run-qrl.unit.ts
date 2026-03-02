import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { _run, runEventHandlerQRL } from './run-qrl';
import * as qrlClass from '../shared/qrl/qrl-class';
import * as useCore from '../use/use-core';
import * as vnodeUtils from './vnode-utils';
import * as promises from '../shared/utils/promises';
import { ITERATION_ITEM_MULTI, ITERATION_ITEM_SINGLE } from '../shared/utils/markers';
import { VNodeFlags } from './types';

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
    invokeApply: vi.fn(),
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

describe('runEventHandlerQRL', () => {
  let mockEvent: Event;
  let mockElement: Element;
  let mockContainer: any;
  let mockContext: any;
  let mockHostElement: any;
  let mockQrl: any;

  beforeEach(() => {
    mockEvent = new Event('click');
    mockElement = createMockElement();
    mockContainer = {
      handleError: vi.fn(),
      $getObjectById$: vi.fn(),
    };
    mockHostElement = { flags: 0 };
    mockContext = {
      $container$: mockContainer,
      $hostElement$: mockHostElement,
    };
    mockQrl = vi.fn();

    vi.mocked(useCore.newInvokeContextFromDOM).mockReturnValue(mockContext);
    vi.mocked(useCore.invokeApply).mockReturnValue(undefined);
    vi.mocked(vnodeUtils.vnode_getProp).mockReturnValue(null);
    vi.mocked(promises.retryOnPromise).mockImplementation((fn) => fn());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return early if element is not connected', () => {
    const disconnectedElement = createMockElement(false);

    const result = runEventHandlerQRL(mockQrl, mockEvent, disconnectedElement, mockContext);

    expect(result).toBeUndefined();
    expect(vnodeUtils.vnode_ensureElementInflated).not.toHaveBeenCalled();
    expect(useCore.invokeApply).not.toHaveBeenCalled();
  });

  it('should create invoke context from DOM when ctx is not provided', () => {
    runEventHandlerQRL(mockQrl, mockEvent, mockElement);

    expect(useCore.newInvokeContextFromDOM).toHaveBeenCalledWith(mockEvent, mockElement);
  });

  it('should use provided ctx without creating a new one', () => {
    runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

    expect(useCore.newInvokeContextFromDOM).not.toHaveBeenCalled();
  });

  it('should call vnode_ensureElementInflated with container and hostElement', () => {
    runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

    expect(vnodeUtils.vnode_ensureElementInflated).toHaveBeenCalledWith(
      mockContainer,
      mockHostElement
    );
  });

  it('should call invokeApply with the handler, event and element', () => {
    runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

    expect(useCore.invokeApply).toHaveBeenCalledWith(mockContext, mockQrl, [
      mockEvent,
      mockElement,
    ]);
  });

  it('should not call invokeApply when host element is deleted', () => {
    mockHostElement.flags = VNodeFlags.Deleted;

    runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

    expect(useCore.invokeApply).not.toHaveBeenCalled();
  });

  it('should forward errors to container.handleError via retryOnPromise error handler', () => {
    const error = new Error('test error');
    vi.mocked(promises.retryOnPromise).mockImplementation((_fn, errorHandler) => {
      errorHandler!(error);
      return undefined;
    });

    runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

    expect(mockContainer.handleError).toHaveBeenCalledWith(error, mockHostElement);
  });

  it('should return the value from retryOnPromise', () => {
    const mockPromise = Promise.resolve();
    vi.mocked(promises.retryOnPromise).mockReturnValue(mockPromise as any);

    const result = runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

    expect(result).toBe(mockPromise);
  });

  describe('with iteration items', () => {
    it('should set InflatedIterationItems flag on first access', () => {
      mockHostElement.flags = VNodeFlags.HasIterationItems;

      runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

      expect(mockHostElement.flags & VNodeFlags.InflatedIterationItems).toBeTruthy();
    });

    it('should use container.$getObjectById$ as getObj when not yet inflated', () => {
      mockHostElement.flags = VNodeFlags.HasIterationItems;

      runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

      expect(vnodeUtils.vnode_getProp).toHaveBeenCalledWith(
        mockHostElement,
        ITERATION_ITEM_SINGLE,
        mockContainer.$getObjectById$
      );
    });

    it('should use null getObj when InflatedIterationItems already set', () => {
      mockHostElement.flags = VNodeFlags.HasIterationItems | VNodeFlags.InflatedIterationItems;

      runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

      expect(vnodeUtils.vnode_getProp).toHaveBeenCalledWith(
        mockHostElement,
        ITERATION_ITEM_SINGLE,
        null
      );
    });

    it('should not wrap handler when no iteration props are found', () => {
      mockHostElement.flags = VNodeFlags.HasIterationItems;
      vi.mocked(vnodeUtils.vnode_getProp).mockReturnValue(null);

      runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

      expect(useCore.invokeApply).toHaveBeenCalledWith(mockContext, mockQrl, [
        mockEvent,
        mockElement,
      ]);
    });

    it('should wrap handler to pass single iteration item as extra argument', () => {
      mockHostElement.flags = VNodeFlags.HasIterationItems;
      const singleItem = { id: 42 };
      vi.mocked(vnodeUtils.vnode_getProp).mockReturnValueOnce(singleItem);
      // When invokeApply runs the wrapped handler, it should call the real handler with singleItem
      vi.mocked(useCore.invokeApply).mockImplementation((_ctx, handler) => {
        (handler as any)();
        return undefined;
      });

      runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

      expect(mockQrl).toHaveBeenCalledWith(mockEvent, mockElement, singleItem);
    });

    it('should wrap handler to spread multi iteration items as extra arguments', () => {
      mockHostElement.flags = VNodeFlags.HasIterationItems;
      const multiItems = ['x', 'y', 'z'];
      vi.mocked(vnodeUtils.vnode_getProp)
        .mockReturnValueOnce(null) // ITERATION_ITEM_SINGLE
        .mockReturnValueOnce(multiItems); // ITERATION_ITEM_MULTI
      vi.mocked(useCore.invokeApply).mockImplementation((_ctx, handler) => {
        (handler as any)();
        return undefined;
      });

      runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

      expect(mockQrl).toHaveBeenCalledWith(mockEvent, mockElement, ...multiItems);
    });

    it('should check ITERATION_ITEM_MULTI when single item prop is null', () => {
      mockHostElement.flags = VNodeFlags.HasIterationItems;
      vi.mocked(vnodeUtils.vnode_getProp).mockReturnValue(null);

      runEventHandlerQRL(mockQrl, mockEvent, mockElement, mockContext);

      expect(vnodeUtils.vnode_getProp).toHaveBeenCalledWith(
        mockHostElement,
        ITERATION_ITEM_MULTI,
        expect.anything()
      );
    });
  });
});
