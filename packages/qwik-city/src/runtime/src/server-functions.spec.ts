import { describe, expect, test, vi } from 'vitest';

// mocks for context hooks
const currentAction: any = { value: undefined };
const location: any = { isNavigating: false };

vi.mock('./use-functions', () => ({
  useAction: () => currentAction,
  useLocation: () => location,
  useQwikCityEnv: () => ({}),
}));

vi.mock('@builder.io/qwik', () => ({
  $: (fn: any) => fn,
  _deserializeData: (d: any) => d,
  _getContextElement: () => null,
  _getContextEvent: () => null,
  _serializeData: (d: any) => d,
  _wrapProp: (v: any) => v,
  implicit$FirstArg: (fn: any) => fn,
  noSerialize: (v: any) => v,
  useContext: () => ({}),
  useStore: (init: any) => (typeof init === 'function' ? init() : init),
  isServer: true,
  isDev: false,
}));

import { routeActionQrl } from './server-functions';
import { $ } from '@builder.io/qwik';

// ensure window is defined even in non-JSDOM environments
if (typeof window === 'undefined') {
  // @ts-ignore
  globalThis.window = {} as any;
}

describe('routeActionQrl', () => {
  test('should not throw and update state when window exists on server', async () => {
    const action = routeActionQrl($(async () => 'ok'));
    const state = action();

    const promise = state.submit({ foo: 'bar' });

    expect(state.submitted).toBe(true);
    expect(state.isRunning).toBe(true);
    expect(location.isNavigating).toBe(true);
    expect(typeof currentAction.value.resolve).toBe('function');

    currentAction.value.resolve({ status: 200, result: 'value' });
    await expect(promise).resolves.toEqual({ status: 200, value: 'value' });

    expect(state.isRunning).toBe(false);
    expect(state.status).toBe(200);
    expect(state.value).toBe('value');
  });
});
