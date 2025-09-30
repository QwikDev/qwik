import type { DomContainer } from '../../client/dom-container';
import { ensureMaterialized, vnode_getNode, vnode_isVNode, vnode_locate } from '../../client/vnode';
import type { ElementVNode, VNode } from '../../client/vnode-impl';
import { AsyncComputedSignalImpl } from '../../reactive-primitives/impl/async-computed-signal-impl';
import { ComputedSignalImpl } from '../../reactive-primitives/impl/computed-signal-impl';
import { SerializerSignalImpl } from '../../reactive-primitives/impl/serializer-signal-impl';
import { SignalImpl } from '../../reactive-primitives/impl/signal-impl';
import { getOrCreateStore } from '../../reactive-primitives/impl/store';
import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { SubscriptionData, type NodePropData } from '../../reactive-primitives/subscription-data';
import { StoreFlags } from '../../reactive-primitives/types';
import { createResourceReturn } from '../../use/use-resource';
import { Task } from '../../use/use-task';
import { componentQrl } from '../component.public';
import { qError, QError } from '../error/error';
import { createPropsProxy, JSXNodeImpl } from '../jsx/jsx-runtime';
import type { DeserializeContainer } from '../types';
import { _UNINITIALIZED } from '../utils/constants';
import { _constants, TypeIds, type Constants } from './constants';
import { needsInflation } from './deser-proxy';
import { parseQRL } from './qrl-to-string';

export const resolvers = new WeakMap<Promise<any>, [Function, Function]>();
export const pendingStoreTargets = new Map<object, { t: TypeIds; v: unknown }>();

export const allocate = (container: DeserializeContainer, typeId: number, value: unknown): any => {
  switch (typeId) {
    case TypeIds.Plain:
      return value;
    case TypeIds.RootRef:
      return container.$getObjectById$(value as number);
    case TypeIds.ForwardRef:
      if (!container.$forwardRefs$) {
        throw qError(QError.serializeErrorCannotAllocate, ['forward ref']);
      }
      const rootRef = container.$forwardRefs$[value as number];
      if (rootRef === -1) {
        return _UNINITIALIZED;
      } else {
        return container.$getObjectById$(rootRef);
      }
    case TypeIds.ForwardRefs:
      return value;
    case TypeIds.Constant:
      return _constants[value as Constants];
    case TypeIds.Array:
      return Array((value as any[]).length / 2);
    case TypeIds.Object:
      return {};
    case TypeIds.QRL:
    case TypeIds.PreloadQRL:
      const qrl =
        typeof value === 'number'
          ? // root reference
            container.$getObjectById$(value)
          : value;
      return parseQRL(qrl as string);
    case TypeIds.Task:
      return new Task(-1, -1, null!, null!, null!, null);
    case TypeIds.Resource: {
      const res = createResourceReturn(
        container as any,
        // we don't care about the timeout value
        undefined,
        undefined
      );
      res.loading = false;
      return res;
    }
    case TypeIds.URL:
      return new URL(value as string);
    case TypeIds.Date:
      return new Date(value as number);
    case TypeIds.Regex:
      const idx = (value as string).lastIndexOf('/');
      return new RegExp((value as string).slice(1, idx), (value as string).slice(idx + 1));
    case TypeIds.Error:
      return new Error();
    case TypeIds.Component:
      return componentQrl(null!);
    case TypeIds.Signal:
      return new SignalImpl(container as any, 0);
    case TypeIds.WrappedSignal:
      return new WrappedSignalImpl(container as any, null!, null!, null!);
    case TypeIds.ComputedSignal:
      return new ComputedSignalImpl(container as any, null!);
    case TypeIds.AsyncComputedSignal:
      return new AsyncComputedSignalImpl(container as any, null!);
    case TypeIds.SerializerSignal:
      return new SerializerSignalImpl(container as any, null!);
    case TypeIds.Store: {
      const data = value as [TypeIds, unknown];
      // We need to allocate the store first, before we inflate its data, because the data can
      // reference the store itself (circular)
      // Note: the actual store data will be inflated in inflate()
      const t = data[0] as TypeIds;
      const v = data[1];
      const storeValue = allocate(container, t, v);
      const store = getOrCreateStore(storeValue, StoreFlags.NONE, container as DomContainer);
      if (needsInflation(t)) {
        pendingStoreTargets.set(store, { t, v });
      }
      // We must store the reference so it doesn't get deserialized again in inflate()
      data[0] = TypeIds.Plain;
      data[1] = storeValue;
      return store;
    }
    case TypeIds.URLSearchParams:
      return new URLSearchParams(value as string);
    case TypeIds.FormData:
      return new FormData();
    case TypeIds.JSXNode:
      return new JSXNodeImpl(null!, null!, null!, null!, -1, null);
    case TypeIds.BigInt:
      return BigInt(value as string);
    case TypeIds.Set:
      return new Set();
    case TypeIds.Map:
      return new Map();
    case TypeIds.Promise:
      let resolve!: (value: any) => void;
      let reject!: (error: any) => void;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      resolvers.set(promise, [resolve, reject]);
      // Don't leave unhandled promise rejections
      promise.catch(() => {});
      return promise;
    case TypeIds.Uint8Array:
      const encodedLength = (value as string).length;
      const blocks = encodedLength >>> 2;
      const rest = encodedLength & 3;
      const decodedLength = blocks * 3 + (rest ? rest - 1 : 0);
      return new Uint8Array(decodedLength);
    case TypeIds.PropsProxy:
      return createPropsProxy(null!, null);
    case TypeIds.VNode:
      return retrieveVNodeOrDocument(container, value);
    case TypeIds.RefVNode:
      const vNode = retrieveVNodeOrDocument(container, value);
      if (vnode_isVNode(vNode)) {
        /**
         * If we have a ref, we need to ensure the element is materialized.
         *
         * Example:
         *
         * ```
         * const Cmp = component$(() => {
         *       const element = useSignal<HTMLDivElement>();
         *
         *       useVisibleTask$(() => {
         *         element.value!.innerHTML = 'I am the innerHTML content!';
         *       });
         *
         *       return (
         *          <div ref={element} />
         *       );
         * });
         * ```
         *
         * If we don't materialize early element with ref property, and change element innerHTML it
         * will be applied to a vnode tree during the lazy materialization, and it is wrong.
         *
         * Next if we rerender component it will remove applied innerHTML, because the system thinks
         * it is a part of the vnode tree.
         */
        ensureMaterialized(vNode as ElementVNode);
        return vnode_getNode(vNode);
      } else {
        throw qError(QError.serializeErrorExpectedVNode, [typeof vNode]);
      }
    case TypeIds.SubscriptionData:
      return new SubscriptionData({} as NodePropData);
    default:
      throw qError(QError.serializeErrorCannotAllocate, [typeId]);
  }
};
export function retrieveVNodeOrDocument(
  container: DeserializeContainer,
  value: unknown | null
): VNode | Document | undefined {
  return value
    ? (container as any).rootVNode
      ? vnode_locate((container as any).rootVNode, value as string)
      : undefined
    : container.element?.ownerDocument;
}
