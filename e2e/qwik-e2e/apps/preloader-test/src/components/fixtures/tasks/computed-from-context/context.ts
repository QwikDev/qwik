import { createContextId, type ReadonlySignal, type Signal } from '@qwik.dev/core';

export type Counter = { count: Signal<number>; total: ReadonlySignal<number> };

export const CounterContext = createContextId<Counter>('tasks.computed-from-context');
