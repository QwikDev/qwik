import {
  component$,
  useStore,
  useResource$,
  Resource,
  useTask$,
  createContextId,
  useContextProvider,
  useContext,
  useStyles$,
  type ResourceReturn,
} from "@builder.io/qwik";

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

export const LOGS = createContextId<LogsContext>("qwik.logs.resource");

export const ResourceApp = component$(() => {
  const logs = {
    content: "",
  };
  useContextProvider(LOGS, logs);

  logs.content += "[RENDER] <ResourceApp>\n";
  const state = useStore({
    count: 10,
    countDouble: 0,
    countDoubleDouble: 0,
  });

  useTask$(async ({ track }) => {
    logs.content += "[WATCH] 1 before\n";
    const count = track(() => state.count);
    await delay(100);
    state.countDouble = count * 2;
    logs.content += "[WATCH] 1 after\n";
  });

  useTask$(async ({ track }) => {
    logs.content += "[WATCH] 2 before\n";
    const city = track(() => state.countDouble);
    await delay(100);
    state.countDoubleDouble = city * 2;
    logs.content += "[WATCH] 2 after\n";
  });

  const resource = useResource$<number>(async ({ track }) => {
    logs.content += "[RESOURCE] 1 before\n";
    const count = track(() => state.countDoubleDouble);
    await delay(2000);

    logs.content += "[RESOURCE] 1 after\n";
    return count * 2;
  });

  // const resource2 = useResource$<number>(async ({ track }) => {
  //   logs.content += '[RESOURCE] 2 before\n';
  //   const count = track(state, 'countDoubleDouble');
  //   await delay(2000);

  //   logs.content += '[RESOURCE] 2 after\n';
  //   return count * 4;
  // });
  const resourceState = resource.loading ? "pending" : "resolved";

  return (
    <div>
      <button type="button" class="increment" onClick$={() => state.count++}>
        Increment
      </button>
      <div id="outside-state">{resourceState}</div>
      <Results result={resource} />
    </div>
  );
});

export const Results = component$(
  (props: { result: ResourceReturn<number> }) => {
    useStyles$(`
    .logs {
      white-space: pre;
    }`);
    const logs = useContext(LOGS);
    logs.content += "[RENDER] <Results>\n\n\n";
    const logscontent = logs.content + "";

    const state = useStore({
      count: 0,
    });
    const resourceState = props.result.loading ? "pending" : "resolved";
    return (
      <div>
        <div id="inside-state">{resourceState}</div>
        <Resource
          value={props.result}
          onPending={() => <div class="resource1">loading resource 1...</div>}
          onRejected={(reason) => (
            <div class="resource1">error {`${reason}`}</div>
          )}
          onResolved={(number) => {
            return (
              <>
                <div class="resource1">resource 1 is {number}</div>
                <button class="count" onClick$={() => state.count++}>
                  count is {mutable(state.count + 0)}
                </button>
              </>
            );
          }}
        />

        <div class="logs">{logscontent}</div>
      </div>
    );
  },
);

export function mutable(value: any) {
  return value;
}
export function delay(nu: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, nu);
  });
}
