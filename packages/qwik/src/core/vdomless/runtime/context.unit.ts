import { describe, expect, it } from 'vitest';
import { createComponent } from '../component/component';
import { useSignal } from '../reactive/public-api';
import { BranchSubscription, createBranch } from '../dom/branch/branch';
import { createBranchRange, createNode, noopSchedule } from '../test-utils';
import type { ContainerContext } from './container-context';
import {
  getActiveInvokeContext,
  invoke,
  newInvokeContext,
  type RuntimeInvokeContext,
} from './invoke-context';
import { Scheduler } from './scheduler';
import { useContext, useContextProvider, type ContextId } from './context';

describe('context runtime', () => {
  it('provides and reads context in the active invoke context', () => {
    const contextId = createTestContextId<{ value: string }>('context-simple');
    const invokeContext = newInvokeContext();

    const value = invoke(invokeContext, () => {
      useContextProvider(contextId, { value: 'provided' });
      return useContext(contextId);
    });

    expect(value).toEqual({ value: 'provided' });
  });

  it('uses one local context scope for multiple providers in one render', () => {
    const firstContext = createTestContextId<string>('context-first');
    const secondContext = createTestContextId<number>('context-second');
    const invokeContext = newInvokeContext();

    invoke(invokeContext, () => {
      useContextProvider(firstContext, 'first');
      const scope = getActiveInvokeContext().localContextScope;

      useContextProvider(secondContext, 2);

      expect(getActiveInvokeContext().localContextScope).toBe(scope);
      expect(getActiveInvokeContext().contextScope).toBe(scope);
      expect(useContext(firstContext)).toBe('first');
      expect(useContext(secondContext)).toBe(2);
    });
  });

  it('shadows parent context in nested provider components', () => {
    const contextId = createTestContextId<string>('context-shadow');
    const invokeContext = newInvokeContext();
    let innerValue = '';

    const outerValue = invoke(invokeContext, () => {
      useContextProvider(contextId, 'outer');
      createComponent(null, () => {
        useContextProvider(contextId, 'inner');
        createComponent(null, () => {
          innerValue = useContext(contextId);
        });
      });
      return useContext(contextId);
    });

    expect(innerValue).toBe('inner');
    expect(outerValue).toBe('outer');
  });

  it('treats intermediate components without providers as transparent', () => {
    const contextId = createTestContextId<string>('context-transparent');
    const invokeContext = newInvokeContext();
    let value = '';

    invoke(invokeContext, () => {
      useContextProvider(contextId, 'visible');
      createComponent(null, () => {
        createComponent(null, () => {
          value = useContext(contextId);
        });
      });
    });

    expect(value).toBe('visible');
  });

  it('does not leak a provider context to sibling components', () => {
    const contextId = createTestContextId<string>('context-siblings');
    const invokeContext = newInvokeContext();
    let providedValue = '';
    let siblingValue = '';

    invoke(invokeContext, () => {
      createComponent(null, () => {
        useContextProvider(contextId, 'child');
        providedValue = useContext(contextId);
      });
      createComponent(null, () => {
        siblingValue = useContext(contextId, 'fallback');
      });
    });

    expect(providedValue).toBe('child');
    expect(siblingValue).toBe('fallback');
  });

  it('finds falsy context values', () => {
    const emptyContext = createTestContextId<string>('context-empty');
    const falseContext = createTestContextId<boolean>('context-false');
    const nullContext = createTestContextId<null>('context-null');
    const undefinedContext = createTestContextId<undefined>('context-undefined');
    const invokeContext = newInvokeContext();

    invoke(invokeContext, () => {
      useContextProvider(emptyContext, '');
      useContextProvider(falseContext, false);
      useContextProvider(nullContext, null);
      useContextProvider(undefinedContext, undefined);

      expect(useContext(emptyContext, 'fallback')).toBe('');
      expect(useContext(falseContext, 'fallback')).toBe(false);
      expect(useContext(nullContext, 'fallback')).toBeNull();
      expect(useContext(undefinedContext, 'fallback')).toBeUndefined();
    });
  });

  it('supports missing context errors, defaults, and transformers', () => {
    const contextId = createTestContextId<{ value: string }>('context-missing');
    const invokeContext = newInvokeContext();

    invoke(invokeContext, () => {
      expect(useContext(contextId, { value: 'default' })).toEqual({ value: 'default' });
      expect(useContext(contextId, (value) => value?.value ?? 'transformed-default')).toBe(
        'transformed-default'
      );
      expect(() => useContext(contextId)).toThrow(/useContext\(context-missing\)/);
    });
  });

  it('passes the provided value to transformer callbacks', () => {
    const contextId = createTestContextId<{ value: string }>('context-transformer');
    const invokeContext = newInvokeContext();

    const value = invoke(invokeContext, () => {
      useContextProvider(contextId, { value: 'provided' });
      return useContext(contextId, (current) => current?.value);
    });

    expect(value).toBe('provided');
  });

  it('runs transformer callbacks in the active invoke context', () => {
    const contextId = createTestContextId<string>('context-transformer-main');
    const dependencyContext = createTestContextId<string>('context-transformer-dependency');
    const invokeContext = newInvokeContext();

    const value = invoke(invokeContext, () => {
      useContextProvider(dependencyContext, 'dependency');
      return useContext(contextId, () => useContext(dependencyContext));
    });

    expect(value).toBe('dependency');
  });

  it('inherits context into branch renderers and branch components', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const contextId = createTestContextId<string>('context-branch');
    const visible = useSignal(true);
    const branchNode = createNode('branch');
    const { range, replacements } = createBranchRange();
    const invokeContext = newInvokeContext();
    let branchContext!: RuntimeInvokeContext;
    let branchValue = '';

    const branch = invoke(invokeContext, () => {
      useContextProvider(contextId, 'branch-value');
      return createBranch(
        { scheduler } as ContainerContext,
        range,
        () => visible.value,
        () => {
          createComponent(null, () => {
            branchContext = getActiveInvokeContext();
            branchValue = useContext(contextId);
          });
          return [branchNode];
        }
      );
    });

    scheduler.notify(branch);
    await scheduler.flushInteraction();

    expect((branch as BranchSubscription).branch.currentBranch).toBe(0);
    expect(branchContext.contextScope?.values.get(contextId.id)).toBe('branch-value');
    expect(branchValue).toBe('branch-value');
    expect(replacements).toEqual([[branchNode]]);
  });
});

const createTestContextId = <STATE>(id: string): ContextId<STATE> => {
  return { id } as ContextId<STATE>;
};
