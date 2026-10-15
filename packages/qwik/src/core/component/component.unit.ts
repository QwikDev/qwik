import { describe, expect, it, vi } from 'vitest';
import { createNode, createText, noopSchedule, runWithTestContainer } from '../test-utils';
import { createTextNodeEffect } from '../dom/effect/text-effect';
import { useSignal } from '../reactive/public-api';
import type { ContainerContext } from '../runtime/container-context';
import { getActiveCollector, runWithCollector } from '../reactive/tracking';
import {
  getActiveInvokeContext,
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
  newInvokeContext,
  type RuntimeInvokeContext,
} from '../runtime/invoke-context';
import type { ContextScope } from '../runtime/context-scope';
import type { SlotScope } from '../dom/slot/slot';
import {
  createOwner,
  disposeOwner,
  ownerItemAt,
  ownerItemsLength,
  runWithOwner,
} from '../runtime/owner';
import { Scheduler } from '../runtime/scheduler';
import type { DomSubscriber } from '../runtime/subscriber';
import { useTask } from '../runtime/task';
import { createComponent, type ComponentRenderFn } from './component';

describe('components and invoke contexts', () => {
  it('returns synchronous component output directly', () => {
    const owner = createOwner(null);
    expect(runWithOwner(owner, () => createComponent(() => 'ready', null))).toBe('ready');
    expect(owner).not.toHaveProperty('disposalCallbacks');
  });

  it.each(['throw', 'reject'] as const)(
    'creates fresh invoke contexts while preserving the host across %s retries',
    async (mode) => {
      const owner = createOwner(null);
      const parent = newInvokeContext({ owner });
      const contexts: RuntimeInvokeContext[] = [];
      const render = () => {
        contexts.push(getActiveInvokeContext());
        if (contexts.length < 3) {
          const pending = Promise.resolve();
          if (mode === 'throw') {
            throw pending;
          }
          return Promise.reject(pending);
        }
        return 'ready';
      };
      const output = invoke(parent, () => createComponent(render, null));
      parent.owner = null;
      await expect(output).resolves.toBe('ready');
      expect(new Set(contexts).size).toBe(3);
      expect(contexts.every((context) => context.ownerHost === owner)).toBe(true);
      expect(owner).not.toHaveProperty('disposalCallbacks');
    }
  );

  it('ignores a discarded component after its pending work settles', async () => {
    const owner = createOwner(null);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const render = vi.fn(() => {
      throw render.mock.calls.length === 1 ? Promise.resolve() : pending;
    });
    const output = runWithOwner(owner, () => createComponent(render, null));
    for (let tick = 0; tick < 12; tick++) {
      await Promise.resolve();
    }
    expect(render).toHaveBeenCalledTimes(2);
    let finished = false;
    void Promise.resolve(output).then(() => {
      finished = true;
    });
    disposeOwner(owner);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(finished).toBe(false);
    release();
    await expect(output).resolves.toEqual([]);
    await pending;
    await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(2);
    expect(owner).not.toHaveProperty('disposalCallbacks');
  });

  it('disposes the final failed attempt when the retry budget is exhausted', async () => {
    const owner = createOwner(null);
    const contexts: RuntimeInvokeContext[] = [];
    const pending = Promise.resolve();
    const output = runWithOwner(owner, () =>
      createComponent(() => {
        const context = getActiveInvokeContext();
        contexts.push(context);
        createTextNodeEffect(createText(), useSignal('failed'));
        throw pending;
      }, null)
    );
    await expect(output).rejects.toThrow(/retry count/);
    expect(contexts).toHaveLength(101);
    expect(contexts.at(-1)!.owner).toBeNull();
    disposeOwner(owner);
  });

  it('mounts components without collecting direct signal reads', () => {
    const count = useSignal(1);
    const node = createNode('component');

    const nodes = createComponent((source) => {
      expect(getActiveCollector()).toBeNull();
      source.value;
      return [node];
    }, count);

    expect(nodes).toEqual([node]);
    expect(count.subs).toBeNull();
  });

  it('returns scalar node component output', () => {
    const node = createNode('component');

    const output = createComponent(() => node, null);

    expect(output).toBe(node);
  });

  it('does not collect direct component reads from an outer collector', () => {
    const scheduler = new Scheduler(noopSchedule);
    const collector = runWithTestContainer(scheduler, () => useTask(() => {}));
    const count = useSignal(1);
    const node = createNode('component');

    runWithCollector(collector, () => {
      const nodes = createComponent((source) => {
        source.value;
        return [node];
      }, count);

      expect(nodes).toEqual([node]);
    });

    expect(count.subs).toBeNull();
    expect(collector.deps).toBeNull();
  });

  it('registers component render work with the active owner', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner();
    const source = useSignal('mounted');
    const text = createText();
    const node = createNode('component');
    let nodes!: readonly Node[];
    let effect!: DomSubscriber;

    runWithOwner(owner, () => {
      nodes = createComponent(
        (props) => {
          effect = createTextNodeEffect(props.text, props.source, scheduler);
          scheduler.notify(effect);
          return [node];
        },
        { source, text }
      );
    });
    await scheduler.flushInteraction();

    expect(nodes).toEqual([node]);
    expect(text.data).toBe('mounted');
    expect(ownerItemsLength(owner.items)).toBe(1);
    expect(ownerItemAt(owner.items!, 0)).not.toBe(effect);
    expect(effect.owner?.parent).toBe(owner);
    expect(effect.owner?.items).toBe(effect);
    expect(source.subs).not.toBeNull();

    disposeOwner(owner);

    expect(source.subs).toBeNull();
  });

  it('allows async component renderers to propagate through SSR', async () => {
    const render = (() => Promise.resolve([])) as unknown as ComponentRenderFn<null>;

    await expect(createComponent(render, null)).resolves.toEqual([]);
  });

  it('returns component strings for server renderers', () => {
    const html = createComponent((props) => `<span>${props.name}</span>`, { name: 'Qwik' });

    expect(html).toBe('<span>Qwik</span>');
  });

  it('passes render context without an adapter callback', () => {
    const renderContext = { prefix: 'Hello' };
    const slotScope: SlotScope = { projections: [], slotContentQrl: null, children: null };
    let activeContext!: RuntimeInvokeContext;

    const html = createComponent(
      (props: Record<string, unknown>, context: typeof renderContext) => {
        activeContext = getActiveInvokeContext();
        return `${context.prefix} ${String(props.name)}`;
      },
      { name: 'Qwik' },
      renderContext,
      { slotScope }
    );
    const emptyProps = createComponent(
      (props: Record<string, unknown>, context: typeof renderContext) =>
        `${context.prefix} ${Object.keys(props).length}`,
      null,
      renderContext
    );

    expect(html).toBe('Hello Qwik');
    expect(emptyProps).toBe('Hello 0');
    expect(activeContext.slotScope).toBe(slotScope);
  });

  it('preserves render context when retrying a direct component call', async () => {
    const renderContext = { value: 'ready' };
    const pending = Promise.resolve();
    let attempts = 0;

    const output = createComponent(
      (_props: Record<string, unknown>, context: typeof renderContext) => {
        if (attempts++ === 0) {
          throw pending;
        }
        return context.value;
      },
      null,
      renderContext
    );

    await expect(output).resolves.toBe('ready');
    expect(attempts).toBe(2);
  });

  it('disposes component work when render throws', () => {
    const source = useSignal('value');
    const text = createText();
    const owner = createOwner();
    let effect!: DomSubscriber;

    expect(() => {
      runWithOwner(owner, () => {
        createComponent(() => {
          effect = createTextNodeEffect(text, source);
          throw new Error('render failed');
        }, null);
      });
    }).toThrow('render failed');

    expect(effect.owner).toBeNull();
    expect(owner.items).toBeNull();
  });

  it('creates child invoke contexts for component renderers', () => {
    const contextScope: ContextScope = {
      id: 'context',
      parent: null,
      values: new Map(),
    };
    const parentOwner = createOwner();
    const container = {} as ContainerContext;
    const slotScope: SlotScope = {
      projections: [],
      slotContentQrl: null,
      children: null,
    };
    const parentContext = newInvokeContext({
      owner: parentOwner,
      container,
      contextScope,
      slotScope,
    });
    let activeContext!: RuntimeInvokeContext;

    const nodes = invoke(parentContext, () =>
      createComponent(() => {
        activeContext = getActiveInvokeContext();
      }, null)
    );

    expect(nodes).toEqual([]);
    expect(activeContext.owner).not.toBe(parentOwner);
    expect(activeContext.owner).toBeNull();
    expect(activeContext.container).toBe(container);
    expect(activeContext.contextScope).toBe(contextScope);
    expect(activeContext.localContextScope).toBeNull();
    expect(activeContext.slotScope).toBe(slotScope);
  });

  it('creates child invoke contexts with inherited fields and lazy owner', () => {
    const parentOwner = createOwner();
    const contextScope: ContextScope = {
      id: 'context',
      parent: null,
      values: new Map(),
    };
    const localContextScope: ContextScope = {
      id: 'local',
      parent: contextScope,
      values: new Map(),
    };
    const slotScope: SlotScope = {
      projections: [],
      slotContentQrl: null,
      children: null,
    };
    const container = {} as ContainerContext;
    const parentContext = newInvokeContext({
      owner: parentOwner,
      container,
      contextScope,
      localContextScope,
      slotScope,
    });

    const childContext = newChildInvokeContext(parentContext);

    expect(childContext.owner).toBeNull();
    expect(childContext.container).toBe(container);
    expect(childContext.contextScope).toBe(contextScope);
    expect(childContext.localContextScope).toBeNull();
    expect(childContext.slotScope).toBe(slotScope);
  });

  it('restores invoke context after throw', () => {
    const outerContext = newInvokeContext();
    const innerContext = newInvokeContext();

    invoke(outerContext, () => {
      expect(getActiveInvokeContext()).toBe(outerContext);

      expect(() => {
        invoke(innerContext, () => {
          expect(getActiveInvokeContext()).toBe(innerContext);
          throw new Error('boom');
        });
      }).toThrow('boom');

      expect(getActiveInvokeContext()).toBe(outerContext);
    });

    expect(getActiveInvokeContextOrNull()).toBeNull();
  });
});
