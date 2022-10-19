/* eslint-disable */
import {
  component$,
  useClientEffect$,
  useRef,
  useStore,
  useStyles$,
  Slot,
  useSignal,
  useWatch$,
} from '@builder.io/qwik';
import { delay } from '../streaming/streaming';

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
      <Issue1413 />
      <Issue1717 />
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
    </div>
  );
});

export const Timer = component$(() => {
  console.log('<Timer> renders');

  const container = useRef();
  const state = useStore({
    count: 0,
    msg: 'empty',
  });

  // Double count watch
  useClientEffect$(() => {
    state.msg = 'run';
    container.current!.setAttribute('data-effect', 'true');
  });

  // Double count watch
  useClientEffect$(() => {
    state.count = 10;
    const timer = setInterval(() => {
      state.count++;
    }, 500);
    return () => {
      clearInterval(timer);
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
  useClientEffect$(
    () => {
      state.msg = 'run';
    },
    {
      eagerness: 'load',
    }
  );

  return (
    <div>
      <div id="eager-msg">{state.msg}</div>
      <ClientSide key={state.msg} />
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

  useClientEffect$(
    () => {
      state.text1 = 'run';
    },
    {
      eagerness: 'load',
    }
  );

  useClientEffect$(() => {
    state.text2 = 'run';
  });

  useClientEffect$(
    () => {
      state.text3 = 'run';
    },
    {
      eagerness: 'idle',
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
  useClientEffect$(() => {
    console.log('Client effect fancy name');
  });
  return <Slot />;
});

export const fancyName = 'Some';

export const Issue1413 = component$(() => {
  useClientEffect$(() => {
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
  useClientEffect$(() => {
    ready.value = value;
  });
  return ready;
}

export const Issue1717 = component$(() => {
  const val1 = useDelay('value 1');
  const val2 = useDelay('value 2');
  const renders = useStore(
    {
      count: 0,
    },
    { reactive: false }
  );
  const signal = useSignal(0);
  useWatch$(async () => {
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
