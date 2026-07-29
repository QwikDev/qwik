/* eslint-disable */
import {
  component$,
  createContextId,
  Slot,
  useComputed$,
  useContext,
  useContextProvider,
  useSignal,
  useStore,
  useStyles$,
  useTask$,
  useVisibleTask$,
  untrack,
  type Signal,
} from '@qwik.dev/core';
import { delay } from '../delay';

export const EffectClient = component$(() => {
  useStyles$(`.box {
    background: blue;
    width: 100px;
    height: 100px;
    margin: 10px;
  }`);
  console.log('<EffectClient> renders');
  return (
    <div>
      <CleanupEffects />
      <ClientEffectConsoleLogIssue1413 />
      <CustomHookClientEffectIssue1717 />
      <AsyncClientEffectBlockingIssue2015 />
      <ProjectionComponentRootClientEffectIssue1955 />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />

      <Timer />
      <Eager></Eager>
      <VisibleTaskAfterDestructionIssue4432 />
    </div>
  );
});

export const Timer = component$(() => {
  console.log('<Timer> renders');

  const container = useSignal<Element>();
  const state = useStore({
    count: 0,
    msg: 'empty',
  });

  // Double count watch
  useVisibleTask$(() => {
    state.msg = 'run';
    container.value!.setAttribute('data-effect', 'true');
  });

  // Double count watch
  useVisibleTask$(() => {
    state.count = 10;
    const timer = setTimeout(() => {
      state.count++;
    }, 500);
    return () => {
      clearTimeout(timer);
    };
  });

  return (
    <div id="container" ref={container}>
      <div id="counter">{state.count}</div>
      <div id="msg">{state.msg}</div>
    </div>
  );
});

export const Eager = component$(() => {
  console.log('<Timer> renders');

  const state = useStore({
    msg: 'empty 0',
  });

  // Double count watch
  useVisibleTask$(
    () => {
      state.msg = 'run';
    },
    {
      strategy: 'document-ready',
    }
  );

  return (
    <div>
      <div id="eager-msg">{state.msg}</div>
      {/* Alternating branches remount ClientSide when msg changes (v3 ignores component key). */}
      {state.msg === 'empty 0' ? <ClientSide /> : <ClientSide />}
    </div>
  );
});

export const ClientSide = component$(() => {
  console.log('<Timer> renders');

  const state = useStore({
    text1: 'empty 1',
    text2: 'empty 2',
    text3: 'empty 3',
  });

  useVisibleTask$(
    () => {
      state.text1 = 'run';
    },
    {
      strategy: 'document-ready',
    }
  );

  useVisibleTask$(() => {
    state.text2 = 'run';
  });

  useVisibleTask$(
    () => {
      state.text3 = 'run';
    },
    {
      strategy: 'document-idle',
    }
  );

  return (
    <>
      <div id="client-side-msg-1">{state.text1}</div>
      <div id="client-side-msg-2">{state.text2}</div>
      <div id="client-side-msg-3">{state.text3}</div>
    </>
  );
});

export const FancyName = component$(() => {
  console.log('Fancy Name');
  useVisibleTask$(() => {
    console.log('Client effect fancy name');
  });
  return <Slot />;
});

export const fancyName = 'Some';

export const ClientEffectConsoleLogIssue1413 = component$(() => {
  useVisibleTask$(() => {
    console.log(fancyName);
  });
  console.log('Root route');
  return (
    <FancyName>
      <section>
        <div>Hello</div>
      </section>
    </FancyName>
  );
});

export function useDelay(value: string) {
  const ready = useSignal('---');
  useVisibleTask$(() => {
    ready.value = value;
  });
  return ready;
}

export const CustomHookClientEffectIssue1717 = component$(() => {
  const val1 = useDelay('value 1');
  const val2 = useDelay('value 2');
  const renders = useStore(
    {
      count: 0,
    },
    { reactive: false }
  );
  const signal = useSignal(0);
  useTask$(async () => {
    await delay(500);
    signal.value = 10;
  });
  renders.count++;
  return (
    <>
      <div id="issue-1717-meta">
        Sub: {signal.value + ''} Renders: {renders.count}
      </div>
      <div id="issue-1717-value1">{val1.value}</div>
      <div id="issue-1717-value2">{val2.value}</div>
    </>
  );
});

export const AsyncClientEffectBlockingIssue2015 = component$(() => {
  const state = useStore({
    logs: [] as string[],
  });

  // untrack: reading logs to push would auto-subscribe each task to its own writes.
  useVisibleTask$(async () => {
    untrack(() => state.logs.push('start 1'));
    await delay(100);
    untrack(() => state.logs.push('finish 1'));
  });

  useVisibleTask$(async () => {
    untrack(() => state.logs.push('start 2'));
    await delay(100);
    untrack(() => state.logs.push('finish 2'));
  });

  useVisibleTask$(async () => {
    untrack(() => state.logs.push('start 3'));
    await delay(100);
    untrack(() => {
      state.logs.push('finish 3');
      state.logs = state.logs.slice();
    });
  });

  return <div id="issue-2015-order">Order: {state.logs.join(' ')}</div>;
});

export const ProjectionComponentRootClientEffectIssue1955Helper = component$(() => {
  return (
    <div id="issue-1955-results">
      <Slot />
    </div>
  );
});

export const ProjectionComponentRootClientEffectIssue1955 = component$(() => {
  const signal = useSignal('empty');
  useVisibleTask$(() => {
    signal.value = 'run';
  });
  return (
    <ProjectionComponentRootClientEffectIssue1955Helper>
      {signal.value + ''}
    </ProjectionComponentRootClientEffectIssue1955Helper>
  );
});

export const CleanupEffects = component$(() => {
  const nuCleanups = useSignal(0);
  const counter = useSignal(0);

  return (
    <>
      {/* Alternating branches remount the child on every click (v3 ignores component key). */}
      {counter.value % 2 === 0 ? (
        <CleanupEffectsChild nuCleanups={nuCleanups} />
      ) : (
        <CleanupEffectsChild nuCleanups={nuCleanups} />
      )}
      <button id="cleanup-effects-button" onClick$={() => counter.value++}>
        Add
      </button>
      <div id="cleanup-effects-count">{nuCleanups.value + ''}</div>
    </>
  );
});

export const CleanupEffectsChild = component$((props: { nuCleanups: Signal<number> }) => {
  useVisibleTask$(({ cleanup }) => {
    cleanup(() => {
      props.nuCleanups.value++;
    });
  });
  return <div>Hello</div>;
});

const ContextVisibleTaskAfterDestructionIssue4432 = createContextId<{
  url: URL;
  logs: string;
}>('issue-4432');

export const VisibleTaskAfterDestructionIssue4432 = component$(() => {
  const loc = useStore({
    url: new URL('http://localhost:3000/'),
    logs: '',
  });
  useContextProvider(ContextVisibleTaskAfterDestructionIssue4432, loc);

  return (
    <>
      <button
        id="issue-4432-button"
        onClick$={() => (loc.url = new URL('http://localhost:3000/other'))}
      >
        Change
      </button>
      <pre id="issue-4432-logs">{loc.logs}</pre>
      {loc.url.pathname === '/' && <VisibleTaskAfterDestructionIssue4432Child />}
    </>
  );
});

export const VisibleTaskAfterDestructionIssue4432Child = component$(() => {
  const state = useContext(ContextVisibleTaskAfterDestructionIssue4432);

  const pathname = useComputed$(() => state.url.pathname);

  useVisibleTask$(
    ({ cleanup }) => {
      // Auto-tracked read; untrack the log write so the task does not subscribe to its own output.
      const path = pathname.value;

      // This should only run on page load for path '/'
      untrack(() => (state.logs += `VisibleTask ChildA ${path}\n`));

      // This should only run when leaving the page
      cleanup(() => {
        state.logs += `Cleanup ChildA ${pathname.value}\n`;
      });
    },
    {
      strategy: 'document-ready',
    }
  );

  return (
    <>
      <p>Child A</p>
    </>
  );
});
