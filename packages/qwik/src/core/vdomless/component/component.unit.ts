import { describe, expect, it } from 'vitest';
import { createNode, createText, noopSchedule, runWithTestContainer } from '../test-utils';
import { createTextNodeEffect } from '../dom/effect/effect';
import { createSignal } from '../reactive/signal';
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
import { createOwner, disposeOwner, runWithOwner } from '../runtime/owner';
import { Scheduler } from '../runtime/scheduler';
import type { DomSubscriber } from '../runtime/subscriber';
import { createTask } from '../runtime/task';
import { createComponent, type ComponentRenderFn } from './component';

describe('components and invoke contexts', () => {
  it('mounts components without collecting direct signal reads', () => {
    const count = createSignal(1);
    const node = createNode('component');

    const nodes = createComponent(count, (source) => {
      expect(getActiveCollector()).toBeNull();
      source.value;
      return [node];
    });

    expect(nodes).toEqual([node]);
    expect(count.subs).toBeNull();
  });

  it('returns scalar node component output', () => {
    const node = createNode('component');

    const output = createComponent(null, () => node);

    expect(output).toBe(node);
  });

  it('does not collect direct component reads from an outer collector', () => {
    const scheduler = new Scheduler(noopSchedule);
    const collector = runWithTestContainer(scheduler, () => createTask(() => {}));
    const count = createSignal(1);
    const node = createNode('component');

    runWithCollector(collector, () => {
      const nodes = createComponent(count, (source) => {
        source.value;
        return [node];
      });

      expect(nodes).toEqual([node]);
    });

    expect(count.subs).toBeNull();
    expect(collector.deps).toBeNull();
  });

  it('registers component render work with the active owner', async () => {
    const scheduler = new Scheduler(noopSchedule);
    const owner = createOwner();
    const source = createSignal('mounted');
    const text = createText();
    const node = createNode('component');
    let nodes!: readonly Node[];
    let effect!: DomSubscriber;

    runWithOwner(owner, () => {
      nodes = createComponent({ source, text }, (props) => {
        effect = createTextNodeEffect(props.text, props.source, { scheduler });
        scheduler.notify(effect);
        return [node];
      });
    });
    await scheduler.flushInteraction();

    expect(nodes).toEqual([node]);
    expect(text.data).toBe('mounted');
    expect(owner.items).toHaveLength(1);
    expect(owner.items![0]).not.toBe(effect);
    expect(effect.owner?.parent).toBe(owner);
    expect(effect.owner?.items).toEqual([effect]);
    expect(source.subs).not.toBeNull();

    disposeOwner(owner);

    expect(source.subs).toBeNull();
  });

  it('allows async component renderers to propagate through SSR', async () => {
    const render = (() => Promise.resolve([])) as unknown as ComponentRenderFn<null>;

    await expect(createComponent(null, render)).resolves.toEqual([]);
  });

  it('returns component strings for server renderers', () => {
    const html = createComponent({ name: 'Qwik' }, (props) => `<span>${props.name}</span>`);

    expect(html).toBe('<span>Qwik</span>');
  });

  it('disposes component work when render throws', () => {
    const source = createSignal('value');
    const text = createText();
    const owner = createOwner();
    let effect!: DomSubscriber;

    expect(() => {
      runWithOwner(owner, () => {
        createComponent(null, () => {
          effect = createTextNodeEffect(text, source);
          throw new Error('render failed');
        });
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
      slots: new Map(),
    };
    const parentContext = newInvokeContext({
      owner: parentOwner,
      container,
      idPrefix: 'parent-',
      contextScope,
      slotScope,
    });
    let activeContext!: RuntimeInvokeContext;

    const nodes = invoke(parentContext, () =>
      createComponent(
        null,
        () => {
          activeContext = getActiveInvokeContext();
        },
        {
          idPrefix: 'child-',
        }
      )
    );

    expect(nodes).toEqual([]);
    expect(activeContext.owner).not.toBe(parentOwner);
    expect(activeContext.owner).toBeNull();
    expect(activeContext.container).toBe(container);
    expect(activeContext.idPrefix).toBe('child-');
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
      slots: new Map(),
    };
    const container = {} as ContainerContext;
    const parentContext = newInvokeContext({
      owner: parentOwner,
      container,
      idPrefix: 'parent-',
      contextScope,
      localContextScope,
      slotScope,
    });

    const childContext = newChildInvokeContext(parentContext);

    expect(childContext.owner).toBeNull();
    expect(childContext.container).toBe(container);
    expect(childContext.idPrefix).toBe('parent-');
    expect(childContext.contextScope).toBe(contextScope);
    expect(childContext.localContextScope).toBeNull();
    expect(childContext.slotScope).toBe(slotScope);
  });

  it('restores invoke context after throw', () => {
    const outerContext = newInvokeContext({ idPrefix: 'outer-' });
    const innerContext = newInvokeContext({ idPrefix: 'inner-' });

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
