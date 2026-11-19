import { getDomContainer } from '@qwik.dev/core';
import { createDocument } from '@qwik.dev/core/testing';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { _serialize } from '../../serializer';
import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { createStore, getStoreHandler } from '../reactive-primitives/impl/store';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { EffectProperty, EffectSubscription, StoreFlags } from '../reactive-primitives/types';
import { vnode_newVirtual } from '../client/vnode-utils';
import { createQRL } from '../shared/qrl/qrl-class';
import { _deserialize } from '../shared/serdes/serdes.public';
import { OnRenderProp } from '../shared/utils/markers';
import { Task, TaskFlags } from '../use/use-task';
import { setPreloader } from './bridge';
import { preloadStoreEffects } from './store-effects';

const preload = vi.fn();

beforeEach(() => {
  preload.mockClear();
  setPreloader(preload);
});

afterEach(() => setPreloader(undefined));

test('preloads URL subscribers without running components or changing location', () => {
  const document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
  const container = getDomContainer(document.body);
  const url = new URL('https://example.com/a/');
  const location = createStore(container, { url, params: {} }, StoreFlags.NONE);
  const banner = vnode_newVirtual();
  const otherComponent = vnode_newVirtual();
  container.setHostProp(banner, OnRenderProp, createQRL('banner.js', 'banner'));
  container.setHostProp(otherComponent, OnRenderProp, createQRL('other.js', 'other'));
  const effects = new Set([new EffectSubscription(banner, EffectProperty.COMPONENT)]);
  getStoreHandler(location)!.$effects$ = new Map([
    ['url', effects],
    ['params', new Set([new EffectSubscription(otherComponent, EffectProperty.COMPONENT)])],
  ]);

  preloadStoreEffects(location, 'url');

  expect(preload.mock.calls).toEqual([['banner.js', 1]]);
  expect(location.url).toBe(url);
  expect(banner.dirty).toBe(0);
  expect(effects.size).toBe(1);
});

test('follows derived subscriptions once and ignores inline JSX bindings', () => {
  const document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
  const container = getDomContainer(document.body);
  const location = createStore(container, { url: 'a' }, StoreFlags.NONE);
  const wrapped = new WrappedSignalImpl(container, (value) => value, [location], null);
  const banner = vnode_newVirtual();
  container.setHostProp(banner, OnRenderProp, createQRL('banner.js', 'banner'));
  const derivedEffect = new EffectSubscription(wrapped, EffectProperty.VNODE);
  const componentEffect = new EffectSubscription(banner, EffectProperty.COMPONENT);
  wrapped.$effects$ = new Set([
    derivedEffect,
    componentEffect,
    new EffectSubscription(banner, EffectProperty.VNODE),
  ]);
  getStoreHandler(location)!.$effects$ = new Map([
    ['url', new Set([derivedEffect, componentEffect])],
  ]);

  preloadStoreEffects(location, 'url');

  expect(preload.mock.calls).toEqual([['banner.js', 1]]);
});

test('preloads computed subscribers after their store is serialized and resumed', async () => {
  const location = createStore(null, { url: 'a' }, StoreFlags.NONE);
  const computed = new ComputedSignalImpl(null, createQRL<() => string>('computed.js', 'computed'));
  getStoreHandler(location)!.$effects$ = new Map([
    ['url', new Set([new EffectSubscription(computed, EffectProperty.VNODE)])],
  ]);
  const restored = await _deserialize<typeof location>(await _serialize(location));

  preloadStoreEffects(restored, 'url');

  expect(preload.mock.calls).toEqual([['computed.js', 1]]);
  expect(restored.url).toBe('a');
});

test('preloads a subscribed task without preloading its component', () => {
  const document = createDocument({ html: '<html><body q:container="paused"></body></html>' });
  const container = getDomContainer(document.body);
  const location = createStore(container, { url: 'a' }, StoreFlags.NONE);
  const host = vnode_newVirtual();
  container.setHostProp(host, OnRenderProp, createQRL('component.js', 'component'));
  const task = new Task(TaskFlags.TASK, 0, host, createQRL('task.js', 'task'), null);
  getStoreHandler(location)!.$effects$ = new Map([
    ['url', new Set([new EffectSubscription(task, EffectProperty.COMPONENT)])],
  ]);

  preloadStoreEffects(location, 'url');

  expect(preload.mock.calls).toEqual([['task.js', 1]]);
});

test('leaves stores without URL subscribers alone', () => {
  preloadStoreEffects(createStore(null, { url: 'a' }, StoreFlags.NONE), 'url');
  preloadStoreEffects({ url: 'a' }, 'url');

  expect(preload).not.toHaveBeenCalled();
});
