import { describe, expect, it } from 'vitest';
import { createComponent } from '../component/component';
import { createSignal } from '../reactive/signal';
import type { BranchRange } from '../dom/branch/branch';
import { BranchSubscription, createBranch } from '../dom/branch/branch';
import type { ContainerContext } from './container-context';
import {
  getActiveInvokeContext,
  invoke,
  newInvokeContext,
  type RuntimeInvokeContext,
} from './invoke-context';
import { Scheduler } from './scheduler';
import { createContext, createContextProvider, type ContextId } from './context';

describe('context runtime', () => {
  it('provides and reads context in the active invoke context', () => {
    const contextId = createTestContextId<{ value: string }>('context-simple');
    const invokeContext = newInvokeContext();

    const value = invoke(invokeContext, () => {
      createContextProvider(contextId, { value: 'provided' });
      return createContext(contextId);
    });

    expect(value).toEqual({ value: 'provided' });
  });

  it('uses one local context scope for multiple providers in one render', () => {
    const firstContext = createTestContextId<string>('context-first');
    const secondContext = createTestContextId<number>('context-second');
    const invokeContext = newInvokeContext();

    invoke(invokeContext, () => {
      createContextProvider(firstContext, 'first');
      const scope = getActiveInvokeContext().localContextScope;

      createContextProvider(secondContext, 2);

      expect(getActiveInvokeContext().localContextScope).toBe(scope);
      expect(getActiveInvokeContext().contextScope).toBe(scope);
      expect(createContext(firstContext)).toBe('first');
      expect(createContext(secondContext)).toBe(2);
    });
  });

  it('shadows parent context in nested provider components', () => {
    const contextId = createTestContextId<string>('context-shadow');
    const invokeContext = newInvokeContext();
    let innerValue = '';

    const outerValue = invoke(invokeContext, () => {
      createContextProvider(contextId, 'outer');
      createComponent(null, () => {
        createContextProvider(contextId, 'inner');
        createComponent(null, () => {
          innerValue = createContext(contextId);
        });
      });
      return createContext(contextId);
    });

    expect(innerValue).toBe('inner');
    expect(outerValue).toBe('outer');
  });

  it('treats intermediate components without providers as transparent', () => {
    const contextId = createTestContextId<string>('context-transparent');
    const invokeContext = newInvokeContext();
    let value = '';

    invoke(invokeContext, () => {
      createContextProvider(contextId, 'visible');
      createComponent(null, () => {
        createComponent(null, () => {
          value = createContext(contextId);
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
        createContextProvider(contextId, 'child');
        providedValue = createContext(contextId);
      });
      createComponent(null, () => {
        siblingValue = createContext(contextId, 'fallback');
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
      createContextProvider(emptyContext, '');
      createContextProvider(falseContext, false);
      createContextProvider(nullContext, null);
      createContextProvider(undefinedContext, undefined);

      expect(createContext(emptyContext, 'fallback')).toBe('');
      expect(createContext(falseContext, 'fallback')).toBe(false);
      expect(createContext(nullContext, 'fallback')).toBeNull();
      expect(createContext(undefinedContext, 'fallback')).toBeUndefined();
    });
  });

  it('supports missing context errors, defaults, and transformers', () => {
    const contextId = createTestContextId<{ value: string }>('context-missing');
    const invokeContext = newInvokeContext();

    invoke(invokeContext, () => {
      expect(createContext(contextId, { value: 'default' })).toEqual({ value: 'default' });
      expect(createContext(contextId, (value) => value?.value ?? 'transformed-default')).toBe(
        'transformed-default'
      );
      expect(() => createContext(contextId)).toThrow(/useContext\(context-missing\)/);
    });
  });

  it('passes the provided value to transformer callbacks', () => {
    const contextId = createTestContextId<{ value: string }>('context-transformer');
    const invokeContext = newInvokeContext();

    const value = invoke(invokeContext, () => {
      createContextProvider(contextId, { value: 'provided' });
      return createContext(contextId, (current) => current?.value);
    });

    expect(value).toBe('provided');
  });

  it('runs transformer callbacks in the active invoke context', () => {
    const contextId = createTestContextId<string>('context-transformer-main');
    const dependencyContext = createTestContextId<string>('context-transformer-dependency');
    const invokeContext = newInvokeContext();

    const value = invoke(invokeContext, () => {
      createContextProvider(dependencyContext, 'dependency');
      return createContext(contextId, () => createContext(dependencyContext));
    });

    expect(value).toBe('dependency');
  });

  it('inherits context into branch renderers and branch components', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const contextId = createTestContextId<string>('context-branch');
    const visible = createSignal(true);
    const branchNode = createNode('branch');
    const { range, replacements } = createBranchRange();
    const invokeContext = newInvokeContext();
    let branchContext!: RuntimeInvokeContext;
    let branchValue = '';

    const branch = invoke(invokeContext, () => {
      createContextProvider(contextId, 'branch-value');
      return createBranch(
        { scheduler } as ContainerContext,
        range,
        () => visible.value,
        () => {
          createComponent(null, () => {
            branchContext = getActiveInvokeContext();
            branchValue = createContext(contextId);
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

const noopSchedule = (): void => {};

const createNode = (label: string): Node => {
  return { label } as unknown as Node;
};

const createBranchRange = (): { range: BranchRange; replacements: Node[][] } => {
  const replacements: Node[][] = [];
  return {
    range: {
      replace(nodes: readonly Node[]) {
        replacements.push([...nodes]);
      },
    } as unknown as BranchRange,
    replacements,
  };
};
