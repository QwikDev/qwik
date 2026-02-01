import { getDomContainer } from '@qwik.dev/core';
import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Container } from '../shared/types';
import { clearAllEffects, clearEffectSubscription } from './cleanup';
import { SignalImpl } from './impl/signal-impl';
import { WrappedSignalImpl } from './impl/wrapped-signal-impl';
import { AsyncComputedSignalImpl } from './impl/async-computed-signal-impl';
import { getOrCreateStore, getStoreHandler, getStoreTarget } from './impl/store';
import { EffectProperty, EffectSubscription, StoreFlags } from './types';
import { _EFFECT_BACK_REF } from './backref';
import { vnode_newVirtual, vnode_setProp } from '../client/vnode-utils';
import { ELEMENT_SEQ } from '../shared/utils/markers';
import { PropsProxyHandler } from '../shared/jsx/props-proxy';
import { JSXNodeImpl } from '../shared/jsx/jsx-node';
import { _PROPS_HANDLER } from '../shared/utils/constants';
import { inlinedQrl } from '../shared/qrl/qrl';

describe('cleanup', () => {
  let container: Container;
  let document: Document;

  beforeEach(() => {
    document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
    container = getDomContainer(document.body);
  });

  afterEach(async () => {
    await container.$renderPromise$;
  });

  describe('clearEffectSubscription', () => {
    describe('SignalImpl cleanup', () => {
      it('should remove effect subscription from signal', () => {
        const signal = new SignalImpl(container, 'test');
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        signal.$effects$ = new Set([effect]);
        effect.backRef = new Set([signal]);

        expect(signal.$effects$!.size).toBe(1);

        clearEffectSubscription(container, effect);

        expect(signal.$effects$!.size).toBe(0);
        expect(effect.backRef!.size).toBe(0);
      });

      it('should handle effect not present in signal effects', () => {
        const signal = new SignalImpl(container, 'test');
        const vnode = vnode_newVirtual();
        const effect1 = new EffectSubscription(vnode, EffectProperty.VNODE);
        const effect2 = new EffectSubscription(vnode, 'prop');

        signal.$effects$ = new Set([effect1]);
        effect2.backRef = new Set([signal]);

        expect(signal.$effects$!.size).toBe(1);

        // Clear effect2 which is not in signal's effects
        clearEffectSubscription(container, effect2);

        // effect1 should still be there
        expect(signal.$effects$!.size).toBe(1);
        expect(signal.$effects$!.has(effect1)).toBe(true);
      });

      it('should handle multiple signals in one effect backRef', () => {
        const signal1 = new SignalImpl(container, 'test1');
        const signal2 = new SignalImpl(container, 'test2');
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        signal1.$effects$ = new Set([effect]);
        signal2.$effects$ = new Set([effect]);
        effect.backRef = new Set([signal1, signal2]);

        expect(signal1.$effects$!.size).toBe(1);
        expect(signal2.$effects$!.size).toBe(1);

        clearEffectSubscription(container, effect);

        // Both signals should have effect removed
        expect(signal1.$effects$!.size).toBe(0);
        expect(signal2.$effects$!.size).toBe(0);
        expect(effect.backRef!.size).toBe(0);
      });

      it('should not clear other effects from signal', () => {
        const signal = new SignalImpl(container, 'test');
        const vnode = vnode_newVirtual();
        const effect1 = new EffectSubscription(vnode, EffectProperty.VNODE);
        const effect2 = new EffectSubscription(vnode, 'prop');

        signal.$effects$ = new Set([effect1, effect2]);
        effect1.backRef = new Set([signal]);

        clearEffectSubscription(container, effect1);

        // Only effect1 should be removed, effect2 should remain
        expect(signal.$effects$!.size).toBe(1);
        expect(signal.$effects$!.has(effect2)).toBe(true);
      });
    });

    describe('WrappedSignalImpl cleanup', () => {
      it('should clear hostElement and nested effects when no subscribers remain', () => {
        const wrappedSignal = new WrappedSignalImpl(container, () => 'test', [], null);
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        wrappedSignal.$effects$ = new Set([effect]);
        wrappedSignal.$hostElement$ = document.createElement('div') as any;
        effect.backRef = new Set([wrappedSignal]);

        // Setup nested effects
        const nestedEffect = new EffectSubscription(vnode, 'nested');
        wrappedSignal[_EFFECT_BACK_REF] = new Map([[EffectProperty.VNODE, nestedEffect]]);

        expect(wrappedSignal.$hostElement$).toBeDefined();
        expect(wrappedSignal[_EFFECT_BACK_REF]).toBeDefined();

        clearEffectSubscription(container, effect);

        // Should clear hostElement and nested effects
        expect(wrappedSignal.$hostElement$).toBeUndefined();
        expect(wrappedSignal[_EFFECT_BACK_REF]?.size).toBe(0);
      });

      it('should not clear nested effects if other subscribers exist', () => {
        const wrappedSignal = new WrappedSignalImpl(container, () => 'test', [], null);
        const vnode = vnode_newVirtual();
        const effect1 = new EffectSubscription(vnode, EffectProperty.VNODE);
        const effect2 = new EffectSubscription(vnode, 'prop');

        wrappedSignal.$effects$ = new Set([effect1, effect2]);
        wrappedSignal.$hostElement$ = vnode;
        effect1.backRef = new Set([wrappedSignal]);

        // Setup nested effects
        const nestedEffect = new EffectSubscription(vnode, 'nested');
        wrappedSignal[_EFFECT_BACK_REF] = new Map([[EffectProperty.VNODE, nestedEffect]]);

        expect(wrappedSignal[_EFFECT_BACK_REF]?.size).toBe(1);
        expect(wrappedSignal.$effects$!.size).toBe(2);

        clearEffectSubscription(container, effect1);

        // Should NOT clear hostElement or nested effects since effect2 still exists
        expect(wrappedSignal.$hostElement$).toBe(vnode);
        expect(wrappedSignal[_EFFECT_BACK_REF]?.size).toBe(1);
        expect(wrappedSignal.$effects$!.size).toBe(1);
      });
    });

    describe('AsyncComputedSignalImpl cleanup', () => {
      it('should remove effect from both regular and loading effects', () => {
        const asyncSignal = new AsyncComputedSignalImpl(
          container,
          inlinedQrl(async () => 'test', 'test') as any
        );
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        asyncSignal.$effects$ = new Set([effect]);
        asyncSignal.$loadingEffects$ = new Set([effect]);
        effect.backRef = new Set([asyncSignal]);

        expect(asyncSignal.$effects$!.size).toBe(1);
        expect(asyncSignal.$loadingEffects$!.size).toBe(1);

        clearEffectSubscription(container, effect);

        expect(asyncSignal.$effects$!.size).toBe(0);
        expect(asyncSignal.$loadingEffects$!.size).toBe(0);
      });

      it('should handle missing loadingEffects', () => {
        const asyncSignal = new AsyncComputedSignalImpl(
          container,
          inlinedQrl(async () => 'test', 'test') as any
        );
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        asyncSignal.$effects$ = new Set([effect]);
        asyncSignal.$loadingEffects$ = undefined;
        effect.backRef = new Set([asyncSignal]);

        expect(() => clearEffectSubscription(container, effect)).not.toThrow();
        expect(asyncSignal.$effects$!.size).toBe(0);
      });

      it('should only remove from loadingEffects if not in regular effects', () => {
        const asyncSignal = new AsyncComputedSignalImpl(
          container,
          inlinedQrl(async () => 'test', 'test') as any
        );
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        asyncSignal.$loadingEffects$ = new Set([effect]);
        effect.backRef = new Set([asyncSignal]);

        clearEffectSubscription(container, effect);

        expect(asyncSignal.$loadingEffects$!.size).toBe(0);
      });
    });

    describe('Store cleanup', () => {
      it('should remove effect from store property effects', () => {
        const store = getOrCreateStore({ name: 'John', age: 30 }, StoreFlags.NONE, container);
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);
        const effect2 = new EffectSubscription(vnode, EffectProperty.VNODE);

        // Setup store handler with effects
        const storeTarget = getStoreTarget(store)!;
        const handler = getStoreHandler(store)!;
        handler.$effects$ = new Map([
          ['name', new Set([effect])],
          ['age', new Set([effect2])],
        ]);
        effect.backRef = new Set([storeTarget]);

        expect(handler.$effects$!.get('name')!.size).toBe(1);
        expect(handler.$effects$!.size).toBe(2);

        clearEffectSubscription(container, effect);

        // Effect should be removed from 'name' property and entry deleted since it's empty
        expect(handler.$effects$!.get('name')).toBeUndefined();
        expect(handler.$effects$!.has('age')).toBe(true);
        expect(handler.$effects$!.size).toBe(1);
      });

      it('should remove property map entry when last effect is removed', () => {
        const store = getOrCreateStore({ name: 'John' }, StoreFlags.NONE, container);
        const vnode = vnode_newVirtual();
        const effect1 = new EffectSubscription(vnode, EffectProperty.VNODE);
        const effect2 = new EffectSubscription(vnode, 'prop');

        const storeTarget = getStoreTarget(store)!;
        const handler = getStoreHandler(store)!;
        handler.$effects$ = new Map([['name', new Set([effect1, effect2])]]);
        effect1.backRef = new Set([storeTarget]);

        clearEffectSubscription(container, effect1);

        // effect2 should still be there
        expect(handler.$effects$!.get('name')!.size).toBe(1);
        expect(handler.$effects$!.get('name')!.has(effect2)).toBe(true);

        // Now clear effect2
        effect2.backRef = new Set([storeTarget]);
        clearEffectSubscription(container, effect2);

        // 'name' entry should be removed from map
        expect(handler.$effects$!.has('name')).toBe(false);
      });

      it('should handle multiple properties with effects', () => {
        const store = getOrCreateStore(
          { name: 'John', age: 30, email: 'john@example.com' },
          StoreFlags.NONE,
          container
        );
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);
        const effect2 = new EffectSubscription(vnode, EffectProperty.VNODE);

        const storeTarget = getStoreTarget(store)!;
        const handler = getStoreHandler(store)!;
        handler.$effects$ = new Map([
          ['name', new Set([effect])],
          ['age', new Set([effect])],
          ['email', new Set([effect2])],
        ]);
        effect.backRef = new Set([storeTarget]);

        clearEffectSubscription(container, effect);

        // Effect should be removed from all properties
        expect(handler.$effects$!.has('name')).toBe(false);
        expect(handler.$effects$!.has('age')).toBe(false);
        // Email effect should remain, its different effect
        expect(handler.$effects$!.has('email')).toBe(true);
        expect(handler.$effects$!.size).toBe(1);
      });

      it('should not fail if store has no effects', () => {
        const store = getOrCreateStore({ name: 'John' }, StoreFlags.NONE, container);
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        const storeTarget = getStoreTarget(store)!;
        effect.backRef = new Set([storeTarget]);

        expect(() => clearEffectSubscription(container, effect)).not.toThrow();
      });
    });

    describe('Props proxy cleanup', () => {
      it('should remove effect from props property effects', () => {
        const vnode = vnode_newVirtual();
        vnode_setProp(vnode, ELEMENT_SEQ, []);

        const jsxNode = new JSXNodeImpl('div', { name: 'John', age: 30 }, null, null, 0, false);
        const handler = new PropsProxyHandler(jsxNode);
        const props = new Proxy({}, handler);
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);
        const effect2 = new EffectSubscription(vnode, EffectProperty.VNODE);

        handler.$effects$ = new Map([
          ['name', new Set([effect])],
          ['age', new Set([effect2])],
        ]);
        effect.backRef = new Set([props]);

        expect(handler.$effects$!.get('name')!.size).toBe(1);
        expect(handler.$effects$!.size).toBe(2);

        clearEffectSubscription(container, effect);

        // Effect should be removed from 'name' property and entry deleted since it's empty
        expect(handler.$effects$!.get('name')).toBeUndefined();
        // Age effect should remain, its different effect
        expect(handler.$effects$!.has('age')).toBe(true);
        expect(handler.$effects$!.size).toBe(1);
      });

      it('should handle props with no effects', () => {
        const vnode = vnode_newVirtual();
        vnode_setProp(vnode, ELEMENT_SEQ, []);

        const jsxNode = new JSXNodeImpl('div', { name: 'John' }, null, null, 0, false);
        const props = new Proxy({}, new PropsProxyHandler(jsxNode));
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        effect.backRef = new Set([props]);

        expect(() => clearEffectSubscription(container, effect)).not.toThrow();
      });
    });

    describe('Mixed producers cleanup', () => {
      it('should handle chained wrapped signals: store -> wrappedSignal1 -> wrappedSignal2 -> vnode', () => {
        const store = getOrCreateStore({ count: 0 }, StoreFlags.NONE, container);
        const storeTarget = getStoreTarget(store)!;
        const storeHandler = getStoreHandler(store)!;

        // Create first wrapped signal that depends on store
        const wrappedSignal1 = new WrappedSignalImpl(container, () => store.count * 2, [], null);

        // Create second wrapped signal that depends on first wrapped signal
        const wrappedSignal2 = new WrappedSignalImpl(
          container,
          () => wrappedSignal1.$untrackedValue$ + 10,
          [],
          null
        );

        const vnode = vnode_newVirtual();

        // Set up the effect chain:
        // vnode has effect on wrappedSignal2
        const effect_vnode_to_ws2 = new EffectSubscription(vnode, 'data-value');
        wrappedSignal2.$effects$ = new Set([effect_vnode_to_ws2]);
        wrappedSignal2.$hostElement$ = vnode;
        effect_vnode_to_ws2.backRef = new Set([wrappedSignal2]);

        // wrappedSignal2 has effect on wrappedSignal1
        const effect_ws2_to_ws1 = new EffectSubscription(wrappedSignal2, EffectProperty.VNODE);
        wrappedSignal1.$effects$ = new Set([effect_ws2_to_ws1]);
        effect_ws2_to_ws1.backRef = new Set([wrappedSignal1]);
        wrappedSignal2[_EFFECT_BACK_REF] = new Map([[EffectProperty.VNODE, effect_ws2_to_ws1]]);

        // wrappedSignal1 has effect on store
        const effect_ws1_to_store = new EffectSubscription(wrappedSignal1, EffectProperty.VNODE);

        // Add another independent effect on the same store property (should remain after cleanup)
        const otherVnode = vnode_newVirtual();
        const effect_other_to_store = new EffectSubscription(otherVnode, 'other-prop');

        storeHandler.$effects$ = new Map([
          ['count', new Set([effect_ws1_to_store, effect_other_to_store])],
        ]);
        effect_ws1_to_store.backRef = new Set([storeTarget]);
        effect_other_to_store.backRef = new Set([storeTarget]);
        wrappedSignal1[_EFFECT_BACK_REF] = new Map([[EffectProperty.VNODE, effect_ws1_to_store]]);
        (otherVnode as any)[_EFFECT_BACK_REF] = new Map([['other-prop', effect_other_to_store]]);

        (vnode as any)[_EFFECT_BACK_REF] = new Map([['data-value', effect_vnode_to_ws2]]);

        // Verify initial state
        expect(wrappedSignal2.$effects$!.size).toBe(1);
        expect(wrappedSignal1.$effects$!.size).toBe(1);
        expect(storeHandler.$effects$!.get('count')!.size).toBe(2);

        // Clear the vnode's effects (this should cascade)
        clearAllEffects(container, vnode);

        // vnode should be cleared
        expect((vnode as any)[_EFFECT_BACK_REF].size).toBe(0);

        // wrappedSignal2 should be cleared (no more subscribers)
        expect(wrappedSignal2.$effects$!.size).toBe(0);
        expect(wrappedSignal2.$hostElement$).toBeUndefined();
        expect(wrappedSignal2[_EFFECT_BACK_REF]?.size).toBe(0);

        // wrappedSignal1 should be cleared (no more subscribers)
        expect(wrappedSignal1.$effects$!.size).toBe(0);
        expect(wrappedSignal1.$hostElement$).toBeUndefined();
        expect(wrappedSignal1[_EFFECT_BACK_REF]?.size).toBe(0);

        // store should have only the other effect remaining (not over-cleaned)
        expect(storeHandler.$effects$!.size).toBe(1);
        expect(storeHandler.$effects$!.get('count')!.size).toBe(1);
        expect(storeHandler.$effects$!.get('count')!.has(effect_other_to_store)).toBe(true);
        expect(storeHandler.$effects$!.get('count')!.has(effect_ws1_to_store)).toBe(false);
      });

      it('should handle effect with multiple producer types', () => {
        const signal = new SignalImpl(container, 'test');
        const asyncSignal = new AsyncComputedSignalImpl(
          container,
          inlinedQrl(async () => 'async', 'async') as any
        );
        const store = getOrCreateStore({ value: 42 }, StoreFlags.NONE, container);
        const storeTarget = getStoreTarget(store)!;

        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        // Setup all producers
        signal.$effects$ = new Set([effect]);
        asyncSignal.$effects$ = new Set([effect]);
        const storeHandler = getStoreHandler(store)!;
        storeHandler.$effects$ = new Map([['value', new Set([effect])]]);

        effect.backRef = new Set([signal, asyncSignal, storeTarget]);

        clearEffectSubscription(container, effect);

        // All should be cleaned
        expect(signal.$effects$!.size).toBe(0);
        expect(asyncSignal.$effects$!.size).toBe(0);
        expect(storeHandler.$effects$!.size).toBe(0);
        expect(effect.backRef!.size).toBe(0);
      });
    });

    describe('Memory leak prevention', () => {
      it('should completely clear backRef to prevent memory leaks', () => {
        const signal1 = new SignalImpl(container, 'test1');
        const signal2 = new SignalImpl(container, 'test2');
        const signal3 = new SignalImpl(container, 'test3');
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        signal1.$effects$ = new Set([effect]);
        signal2.$effects$ = new Set([effect]);
        signal3.$effects$ = new Set([effect]);
        effect.backRef = new Set([signal1, signal2, signal3]);

        expect(effect.backRef!.size).toBe(3);

        clearEffectSubscription(container, effect);

        // backRef should be completely cleared
        expect(effect.backRef!.size).toBe(0);
        // All signals should have effect removed
        expect(signal1.$effects$!.size).toBe(0);
        expect(signal2.$effects$!.size).toBe(0);
        expect(signal3.$effects$!.size).toBe(0);
      });

      it('should handle effect with no backRef', () => {
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);
        effect.backRef = null;

        expect(() => clearEffectSubscription(container, effect)).not.toThrow();
      });

      it('should handle effect with empty backRef', () => {
        const vnode = vnode_newVirtual();
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);
        effect.backRef = new Set();

        expect(() => clearEffectSubscription(container, effect)).not.toThrow();
      });
    });
  });

  describe('clearAllEffects', () => {
    it('should clear all effects from a consumer', () => {
      const vnode = vnode_newVirtual();
      const signal = new SignalImpl(container, 'test');
      const effect1 = new EffectSubscription(vnode, EffectProperty.VNODE);
      const effect2 = new EffectSubscription(vnode, 'prop');

      signal.$effects$ = new Set([effect1, effect2]);
      effect1.backRef = new Set([signal]);
      effect2.backRef = new Set([signal]);

      (vnode as any)[_EFFECT_BACK_REF] = new Map([
        [EffectProperty.VNODE, effect1],
        ['prop', effect2],
      ]);

      expect((vnode as any)[_EFFECT_BACK_REF].size).toBe(2);
      expect(signal.$effects$!.size).toBe(2);

      clearAllEffects(container, vnode);

      // All effects should be cleared from consumer
      expect((vnode as any)[_EFFECT_BACK_REF].size).toBe(0);
      // And from the signal
      expect(signal.$effects$!.size).toBe(0);
    });

    it('should handle consumer with no effects', () => {
      const vnode = vnode_newVirtual();

      expect(() => clearAllEffects(container, vnode)).not.toThrow();
    });

    it('should clear effects from multiple signals', () => {
      const vnode = vnode_newVirtual();
      const signal1 = new SignalImpl(container, 'test1');
      const signal2 = new SignalImpl(container, 'test2');
      const signal3 = new SignalImpl(container, 'test3');

      const effect1 = new EffectSubscription(vnode, 'prop1');
      const effect2 = new EffectSubscription(vnode, 'prop2');
      const effect3 = new EffectSubscription(vnode, 'prop3');

      signal1.$effects$ = new Set([effect1]);
      signal2.$effects$ = new Set([effect2]);
      signal3.$effects$ = new Set([effect3]);

      effect1.backRef = new Set([signal1]);
      effect2.backRef = new Set([signal2]);
      effect3.backRef = new Set([signal3]);

      (vnode as any)[_EFFECT_BACK_REF] = new Map([
        ['prop1', effect1],
        ['prop2', effect2],
        ['prop3', effect3],
      ]);

      clearAllEffects(container, vnode);

      expect(signal1.$effects$!.size).toBe(0);
      expect(signal2.$effects$!.size).toBe(0);
      expect(signal3.$effects$!.size).toBe(0);
      expect((vnode as any)[_EFFECT_BACK_REF].size).toBe(0);
    });

    it('should not affect effects from other consumers', () => {
      const vnode1 = vnode_newVirtual();
      const vnode2 = vnode_newVirtual();
      const signal = new SignalImpl(container, 'test');

      const effect1 = new EffectSubscription(vnode1, EffectProperty.VNODE);
      const effect2 = new EffectSubscription(vnode2, EffectProperty.VNODE);

      signal.$effects$ = new Set([effect1, effect2]);
      effect1.backRef = new Set([signal]);
      effect2.backRef = new Set([signal]);

      (vnode1 as any)[_EFFECT_BACK_REF] = new Map([[EffectProperty.VNODE, effect1]]);
      (vnode2 as any)[_EFFECT_BACK_REF] = new Map([[EffectProperty.VNODE, effect2]]);

      // Clear only vnode1's effects
      clearAllEffects(container, vnode1);

      // vnode1's effects should be cleared
      expect((vnode1 as any)[_EFFECT_BACK_REF].size).toBe(0);

      // vnode2's effects should remain
      expect((vnode2 as any)[_EFFECT_BACK_REF].size).toBe(1);
      expect(signal.$effects$!.size).toBe(1);
      expect(signal.$effects$!.has(effect2)).toBe(true);
    });

    it('should clear effects from stores', () => {
      const vnode = vnode_newVirtual();
      const store = getOrCreateStore({ name: 'John', age: 30 }, StoreFlags.NONE, container);
      const storeTarget = getStoreTarget(store)!;

      const effect1 = new EffectSubscription(vnode, 'effect1');
      const effect2 = new EffectSubscription(vnode, 'effect2');

      const storeHandler = getStoreHandler(store)!;
      storeHandler.$effects$ = new Map([
        ['name', new Set([effect1])],
        ['age', new Set([effect2])],
      ]);

      effect1.backRef = new Set([storeTarget]);
      effect2.backRef = new Set([storeTarget]);

      (vnode as any)[_EFFECT_BACK_REF] = new Map([
        ['effect1', effect1],
        ['effect2', effect2],
      ]);

      clearAllEffects(container, vnode);

      expect(storeHandler.$effects$!.size).toBe(0);
      expect((vnode as any)[_EFFECT_BACK_REF].size).toBe(0);
    });

    it('should clear effects from async computed signals', () => {
      const vnode = vnode_newVirtual();
      const asyncSignal = new AsyncComputedSignalImpl(
        container,
        inlinedQrl(async () => 'test', 'test') as any
      );

      const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

      asyncSignal.$effects$ = new Set([effect]);
      asyncSignal.$loadingEffects$ = new Set([effect]);
      effect.backRef = new Set([asyncSignal]);

      (vnode as any)[_EFFECT_BACK_REF] = new Map([[EffectProperty.VNODE, effect]]);

      clearAllEffects(container, vnode);

      expect(asyncSignal.$effects$!.size).toBe(0);
      expect(asyncSignal.$loadingEffects$!.size).toBe(0);
      expect((vnode as any)[_EFFECT_BACK_REF].size).toBe(0);
    });

    describe('Memory leak prevention for clearAllEffects', () => {
      it('should completely sever all connections to prevent memory leaks', () => {
        const vnode = vnode_newVirtual();
        const signal1 = new SignalImpl(container, 'signal1');
        const signal2 = new SignalImpl(container, 'signal2');
        const store = getOrCreateStore({ value: 1 }, StoreFlags.NONE, container);
        const storeTarget = getStoreTarget(store)!;
        const storeHandler = getStoreHandler(store)!;

        const effect1 = new EffectSubscription(vnode, 'effect1');
        const effect2 = new EffectSubscription(vnode, 'effect2');
        const effect3 = new EffectSubscription(vnode, 'effect3');

        signal1.$effects$ = new Set([effect1, effect2]);
        signal2.$effects$ = new Set([effect2]);
        storeHandler.$effects$ = new Map([['value', new Set([effect3])]]);

        effect1.backRef = new Set([signal1]);
        effect2.backRef = new Set([signal1, signal2]);
        effect3.backRef = new Set([storeTarget]);

        (vnode as any)[_EFFECT_BACK_REF] = new Map([
          ['effect1', effect1],
          ['effect2', effect2],
          ['effect3', effect3],
        ]);

        clearAllEffects(container, vnode);

        // Verify complete cleanup
        expect((vnode as any)[_EFFECT_BACK_REF].size).toBe(0);
        expect(signal1.$effects$!.size).toBe(0);
        expect(signal2.$effects$!.size).toBe(0);
        expect(storeHandler.$effects$!.size).toBe(0);
        expect(effect1.backRef!.size).toBe(0);
        expect(effect2.backRef!.size).toBe(0);
        expect(effect3.backRef!.size).toBe(0);
      });

      it('should handle wrapped signals without over-cleaning', () => {
        const vnode = vnode_newVirtual();
        const wrappedSignal = new WrappedSignalImpl(container, () => 'wrapped', [], null);
        const effect = new EffectSubscription(vnode, EffectProperty.VNODE);

        wrappedSignal.$effects$ = new Set([effect]);
        wrappedSignal.$hostElement$ = vnode as any;
        effect.backRef = new Set([wrappedSignal]);

        // Add another consumer to the wrapped signal
        const otherVnode = vnode_newVirtual();
        const otherEffect = new EffectSubscription(otherVnode, EffectProperty.VNODE);
        wrappedSignal.$effects$!.add(otherEffect);
        otherEffect.backRef = new Set([wrappedSignal]);
        (otherVnode as any)[_EFFECT_BACK_REF] = new Map([[EffectProperty.VNODE, otherEffect]]);

        (vnode as any)[_EFFECT_BACK_REF] = new Map([[EffectProperty.VNODE, effect]]);

        // Clear only first vnode
        clearAllEffects(container, vnode);

        // First effect should be removed
        expect((vnode as any)[_EFFECT_BACK_REF].size).toBe(0);
        expect(wrappedSignal.$effects$!.has(effect)).toBe(false);

        // But wrapped signal should still have the other effect
        expect(wrappedSignal.$effects$!.size).toBe(1);
        expect(wrappedSignal.$effects$!.has(otherEffect)).toBe(true);

        // hostElement should NOT be cleared since otherEffect still exists
        expect(wrappedSignal.$hostElement$).toBe(vnode);
      });
    });

    describe('Over-cleaning prevention', () => {
      it('should only clear effects owned by the consumer', () => {
        const consumer1 = vnode_newVirtual();
        const consumer2 = vnode_newVirtual();
        const sharedSignal = new SignalImpl(container, 'shared');

        const effect1 = new EffectSubscription(consumer1, 'prop');
        const effect2 = new EffectSubscription(consumer2, 'prop');

        sharedSignal.$effects$ = new Set([effect1, effect2]);
        effect1.backRef = new Set([sharedSignal]);
        effect2.backRef = new Set([sharedSignal]);

        (consumer1 as any)[_EFFECT_BACK_REF] = new Map([['prop', effect1]]);
        (consumer2 as any)[_EFFECT_BACK_REF] = new Map([['prop', effect2]]);

        // Clear consumer1
        clearAllEffects(container, consumer1);

        // consumer1 should be clean
        expect((consumer1 as any)[_EFFECT_BACK_REF].size).toBe(0);

        // consumer2 should be untouched
        expect((consumer2 as any)[_EFFECT_BACK_REF].size).toBe(1);

        // sharedSignal should only have effect2
        expect(sharedSignal.$effects$!.size).toBe(1);
        expect(sharedSignal.$effects$!.has(effect2)).toBe(true);
        expect(sharedSignal.$effects$!.has(effect1)).toBe(false);
      });
    });
  });
});
