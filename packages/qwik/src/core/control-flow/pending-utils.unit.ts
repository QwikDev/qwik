import { $, createSignal } from '@qwik.dev/core';
import { describe, expect, it, vi } from 'vitest';
import { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { createAsyncSignal } from '../reactive-primitives/signal-api';
import { EffectSubscription } from '../reactive-primitives/types';
import { scheduleEffects } from '../reactive-primitives/utils';
import { JSXNodeImpl } from '../shared/jsx/jsx-node';
import type { PropsProxy } from '../shared/jsx/props-proxy';
import { SubscriptionPatch, SubscriptionPatchChannel } from '../shared/serdes/subscription-patch';
import type { Container } from '../shared/types';
import { _PROPS_HANDLER } from '../shared/utils/constants';
import { applySubscriptionPatches } from './pending-utils';

vi.mock('../reactive-primitives/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../reactive-primitives/utils')>()),
  scheduleEffects: vi.fn(),
}));

describe('subscription patch channels', () => {
  it.each([undefined, SubscriptionPatchChannel.Pending, SubscriptionPatchChannel.Error] as const)(
    'merges the %s signal channel',
    (channel) => {
      const signal = createAsyncSignal($(async () => 1));
      const effect = new EffectSubscription(createSignal(0) as SignalImpl, '.');
      const container = { $getObjectById$: () => signal } as unknown as Container;
      const patch = new SubscriptionPatch(2, new Set([effect]), channel);
      applySubscriptionPatches(container, [patch]);
      const set =
        channel === SubscriptionPatchChannel.Pending
          ? signal.$loadingEffects$
          : channel === SubscriptionPatchChannel.Error
            ? signal.$errorEffects$
            : signal.$effects$;
      expect(set).toEqual(new Set([effect]));
      expect(effect.backRef).toEqual(new Set([signal]));
      expect(scheduleEffects).toHaveBeenLastCalledWith(container, signal, new Set([effect]));
      applySubscriptionPatches(container, [patch]);
      expect(set?.size).toBe(1);
    }
  );

  it('merges props subscriptions with back references', () => {
    const node = new JSXNodeImpl('div', { count: 0 }, null, null, 0, null);
    const props = node.props as PropsProxy;
    const effect = new EffectSubscription(createSignal(0) as SignalImpl, '.');
    const container = { $getObjectById$: () => props } as unknown as Container;
    applySubscriptionPatches(container, [
      new SubscriptionPatch(1, new Map([['count', new Set([effect])]])),
    ]);
    expect(props[_PROPS_HANDLER].$effects$?.get('count')).toEqual(new Set([effect]));
    expect(effect.backRef).toEqual(new Set([props]));
    expect(scheduleEffects).toHaveBeenLastCalledWith(
      container,
      props[_PROPS_HANDLER],
      new Set([effect])
    );
  });
});
