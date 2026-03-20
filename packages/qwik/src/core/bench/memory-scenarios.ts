import {
  _fnSignal,
  createComputedQrl,
  createContextId,
  createSignal,
  inlinedQrl,
} from '@qwik.dev/core';
import { SubscriptionData } from '../reactive-primitives/subscription-data';
import { EffectProperty, EffectSubscription } from '../reactive-primitives/types';
import { JSXNodeImpl } from '../shared/jsx/jsx-node';
import { LazyRef, QRLClass } from '../shared/qrl/qrl-class';
import { _createQRL as createQRL } from '@qwik.dev/core/internal';
import { ElementVNode } from '../shared/vnode/element-vnode';
import { TextVNode } from '../shared/vnode/text-vnode';
import { VirtualVNode } from '../shared/vnode/virtual-vnode';
import {
  createDeleteOperation,
  createInsertOrMoveOperation,
  createRemoveAllChildrenOperation,
  createSetAttributeOperation,
  createSetTextOperation,
} from '../shared/vnode/types/dom-vnode-operation';
import { createDocument } from '../../testing/document';

export interface MemoryBenchmarkScenario {
  id: string;
  title: string;
  count: number;
  allocate: () => unknown[];
}

export const memoryScenarios: MemoryBenchmarkScenario[] = [];

const INSTANCE_COUNT = 10_000;
const VNODE_FLAGS_INDEX_SHIFT = 12;
const VIRTUAL_VNODE_FLAGS = 0b000_000000010 | (-1 << VNODE_FLAGS_INDEX_SHIFT);
const TEXT_VNODE_FLAGS = 0b000_000000100 | 0b000_000001000 | (-1 << VNODE_FLAGS_INDEX_SHIFT);

memoryScenarios.push({
  id: 'function',
  title: 'function instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const fns = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      fns[i] = function fn() {
        return i;
      };
    }
    return fns;
  },
});

memoryScenarios.push({
  id: 'qrl',
  title: 'QRL instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const qrls = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      qrls[i] = createQRL('chunk123', `qrl_${i}`, null, null, null);
    }
    return qrls;
  },
});

memoryScenarios.push({
  id: 'qrl-copy',
  title: 'copied QRL instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const baseQrl = createQRL('chunk123', 'qrl_copy_base', null, null, null);
    const captures: unknown[] = [];
    const copies = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      copies[i] = baseQrl.w(captures);
    }
    return copies;
  },
});

memoryScenarios.push({
  id: 'lazy-ref',
  title: 'LazyRef instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const copies = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      copies[i] = new LazyRef('chunk123', `qrl_${i}`, null);
    }
    return copies;
  },
});

memoryScenarios.push({
  id: 'qrl-class',
  title: 'QRL class instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const lazyRef = new LazyRef('chunk123', 'qrl_class_base', null);
    const copies = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      copies[i] = new QRLClass(lazyRef);
    }
    return copies;
  },
});

memoryScenarios.push({
  id: 'signal',
  title: 'Signal instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const signals = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      signals[i] = createSignal(i);
    }
    return signals;
  },
});

const qrl = inlinedQrl(() => {}, 'myQrl');
memoryScenarios.push({
  id: 'ComputedSignal',
  title: 'ComputedSignal instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const signals = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      signals[i] = createComputedQrl(qrl);
    }
    return signals;
  },
});

const noopFN = () => {};
memoryScenarios.push({
  id: 'wrapped-signal',
  title: 'Wrapped signal instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const signals = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      signals[i] = _fnSignal(noopFN, []);
    }
    return signals;
  },
});

memoryScenarios.push({
  id: 'virtual-vnode',
  title: 'Virtual VNode instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const vnodes = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      vnodes[i] = new VirtualVNode(null, VIRTUAL_VNODE_FLAGS, null, null, null, null, null, null);
    }
    return vnodes;
  },
});

memoryScenarios.push({
  id: 'element-vnode',
  title: 'Element VNode instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const document = createDocument();
    const vnodes = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      vnodes[i] = new ElementVNode(
        null,
        VIRTUAL_VNODE_FLAGS,
        null,
        null,
        null,
        null,
        null,
        null,
        document.createElement('div'),
        'div'
      );
    }
    return vnodes;
  },
});

memoryScenarios.push({
  id: 'text-vnode',
  title: 'Text VNode instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const document = createDocument();
    const vnodes = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      const text = `text-${i}`;
      vnodes[i] = new TextVNode(
        TEXT_VNODE_FLAGS,
        null,
        null,
        null,
        null,
        document.createTextNode(text),
        text
      );
    }
    return vnodes;
  },
});

memoryScenarios.push({
  id: 'jsx-node',
  title: 'JSX node instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const nodes = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      nodes[i] = new JSXNodeImpl(
        'div',
        { class: `cls-${i}` },
        { id: `node-${i}` },
        `child-${i}`,
        0 as never,
        i,
        false
      );
    }
    return nodes;
  },
});

memoryScenarios.push({
  id: 'context-id',
  title: 'context IDs',
  count: INSTANCE_COUNT,
  allocate: () => {
    const contexts = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      contexts[i] = createContextId(`context-${i}`);
    }
    return contexts;
  },
});

memoryScenarios.push({
  id: 'subscription-data',
  title: 'Subscription data instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const subscriptions = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      subscriptions[i] = new SubscriptionData({
        $scopedStyleIdPrefix$: i % 2 === 0 ? null : `s${i}`,
        $isConst$: (i & 1) === 0,
      });
    }
    return subscriptions;
  },
});

memoryScenarios.push({
  id: 'effect-subscription',
  title: 'Effect subscription instances',
  count: INSTANCE_COUNT,
  allocate: () => {
    const subscriptions = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      subscriptions[i] = new EffectSubscription(
        createSignal(i) as never,
        EffectProperty.VNODE,
        new Set([createSignal(i) as never]),
        new SubscriptionData({
          $scopedStyleIdPrefix$: null,
          $isConst$: false,
        })
      );
    }
    return subscriptions;
  },
});

memoryScenarios.push({
  id: 'delete-operation',
  title: 'Delete operations',
  count: INSTANCE_COUNT,
  allocate: () => {
    const document = createDocument();
    const operations = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      operations[i] = createDeleteOperation(document.createTextNode(`delete-${i}`));
    }
    return operations;
  },
});

memoryScenarios.push({
  id: 'set-text-operation',
  title: 'set-text operations',
  count: INSTANCE_COUNT,
  allocate: () => {
    const document = createDocument();
    const operations = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      operations[i] = createSetTextOperation(document.createTextNode(''), `text-${i}`);
    }
    return operations;
  },
});

memoryScenarios.push({
  id: 'insert-or-move-operation',
  title: 'insert-or-move operations',
  count: INSTANCE_COUNT,
  allocate: () => {
    const document = createDocument();
    const parent = document.createElement('div');
    const operations = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      operations[i] = createInsertOrMoveOperation(document.createElement('span'), parent, null);
    }
    return operations;
  },
});

memoryScenarios.push({
  id: 'set-attribute-operation',
  title: 'set-attribute operations',
  count: INSTANCE_COUNT,
  allocate: () => {
    const document = createDocument();
    const operations = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      operations[i] = createSetAttributeOperation(
        document.createElement('div'),
        'data-id',
        `${i}`,
        i % 2 === 0 ? null : 'scoped',
        false
      );
    }
    return operations;
  },
});

memoryScenarios.push({
  id: 'remove-all-children-operation',
  title: 'remove-all-children operations',
  count: INSTANCE_COUNT,
  allocate: () => {
    const document = createDocument();
    const operations = new Array<unknown>(INSTANCE_COUNT);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      operations[i] = createRemoveAllChildrenOperation(document.createElement('div'));
    }
    return operations;
  },
});
