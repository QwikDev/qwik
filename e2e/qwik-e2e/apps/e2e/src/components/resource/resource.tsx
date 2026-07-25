import {
  component$,
  type ComputedSignal,
  createContextId,
  useComputed$,
  useContext,
  useContextProvider,
  useStore,
  useStyles$,
  useTask$,
  untrack,
} from '@qwik.dev/core';
import { delay } from '../delay';

export interface WeatherData {
  name: string;
  wind: { speed: number; deg: number };
  visibility: number;
  temp: number;
  feels_like: number;
  temp_min: number;
  temp_max: number;
  pressure: number;
  humidity: number;
}

interface LogsContext {
  content: string;
}

export const LOGS = createContextId<LogsContext>('qwik.logs.resource');

export const ResourceApp = component$(() => {
  const logs = useStore({
    content: '',
  });
  useContextProvider(LOGS, logs);

  const state = useStore({
    count: 10,
    countDouble: 0,
    countDoubleDouble: 0,
  });

  useTask$(async () => {
    untrack(() => (logs.content += '[WATCH] 1 before\n'));
    const count = state.count;
    await delay(100);
    state.countDouble = count * 2;
    untrack(() => (logs.content += '[WATCH] 1 after\n'));
  });

  useTask$(async () => {
    untrack(() => (logs.content += '[WATCH] 2 before\n'));
    const city = state.countDouble;
    await delay(100);
    state.countDoubleDouble = city * 2;
    untrack(() => (logs.content += '[WATCH] 2 after\n'));
  });

  const resource = useComputed$(async ({ track }) => {
    untrack(() => (logs.content += '[RESOURCE] 1 before\n'));
    const count = track(() => state.countDoubleDouble);
    await delay(1000);

    untrack(() => (logs.content += '[RESOURCE] 1 after\n\n'));
    return count * 2;
  });

  return (
    <div>
      <button type="button" class="increment" onClick$={() => state.count++}>
        Increment
      </button>
      <div id="outside-state">{resource.pending ? 'pending' : 'resolved'}</div>
      <Results result={resource} />
    </div>
  );
});

export const Results = component$((props: { result: ComputedSignal<number> }) => {
  useStyles$(`
    .logs {
      white-space: pre;
    }`);
  const logs = useContext(LOGS);

  const state = useStore({
    count: 0,
  });
  const resourceState = props.result.pending ? 'pending' : 'resolved';
  return (
    <div>
      <div id="inside-state">{resourceState}</div>
      {props.result.pending ? (
        <div class="resource1">loading resource 1...</div>
      ) : props.result.error ? (
        <div class="resource1">error {String(props.result.error)}</div>
      ) : (
        <>
          <div class="resource1">resource 1 is {props.result.value}</div>
          <button class="count" onClick$={() => state.count++}>
            count is {mutable(state.count + 0)}
          </button>
        </>
      )}

      <div class="logs">{logs.content + ''}</div>
    </div>
  );
});

export function mutable(value: any) {
  return value;
}
