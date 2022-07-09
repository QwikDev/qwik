/* eslint-disable */
import {
  component$,
  useStore,
  Host,
  useResource$,
  Resource,
  useWatch$,
  Async,
  createContext,
  useContextProvider,
  useContext,
  useStyles$,
} from '@builder.io/qwik';

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

export const LOGS = createContext<LogsContext>('qwik.logs.resource');

export const ResourceApp = component$(() => {
  const logs = {
    content: '',
  };
  useContextProvider(LOGS, logs);

  logs.content += '[RENDER] <ResourceApp>\n';

  const state = useStore({
    count: 10,
    countDouble: 0,
    countDoubleDouble: 0,
  });

  useWatch$(async (track) => {
    logs.content += '[WATCH] 1 before\n';
    const count = track(state, 'count');
    await delay(100);
    state.countDouble = count * 2;
    logs.content += '[WATCH] 1 after\n';
  });

  useWatch$(async (track) => {
    logs.content += '[WATCH] 2 before\n';
    const city = track(state, 'countDouble');
    await delay(100);
    state.countDoubleDouble = city * 2;
    logs.content += '[WATCH] 2 after\n';
  });

  const resource = useResource$<number>(async ({ track }) => {
    logs.content += '[RESOURCE] 1 before\n';
    const count = track(state, 'countDoubleDouble');
    await delay(2000);

    logs.content += '[RESOURCE] 1 after\n';
    return count * 2;
  });

  const resource2 = useResource$<number>(async ({ track }) => {
    logs.content += '[RESOURCE] 2 before\n';
    const count = track(state, 'countDoubleDouble');
    await delay(2000);

    logs.content += '[RESOURCE] 2 after\n';
    return count * 4;
  });

  return (
    <Host>
      <button type="button" onClick$={() => state.count++}>
        Increment
      </button>
      <Results result={resource} result2={resource2} />
    </Host>
  );
});

export const Results = component$(
  (props: { result: Resource<number>; result2: Resource<number> }) => {
    useStyles$(`
    .logs {
      white-space: pre;
    }`);
    const logs = useContext(LOGS);
    logs.content += '[RENDER] <Results>\n\n\n';

    return (
      <Host>
        <Async
          resource={props.result}
          onPending={() => <div class="resource1">loading resource 1...</div>}
          onRejected={(reason) => <div class="resource1">error {reason}</div>}
          onResolved={(number) => {
            return <div class="resource1">resource 1 is {number}</div>;
          }}
        />

        <Async
          resource={props.result2}
          onPending={() => <div class="resource2">loading resource 2...</div>}
          onRejected={(reason) => <div class="resource2">error {reason}</div>}
          onResolved={(number) => {
            return <div class="resource2">resource 2 is {number}</div>;
          }}
        />

        <div class="logs">{logs.content}</div>
      </Host>
    );
  }
);

export function delay(nu: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, nu);
  });
}
