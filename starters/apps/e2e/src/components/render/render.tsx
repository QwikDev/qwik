import { component$, useSignal, useStore, useStylesScoped$, useWatch$ } from '@builder.io/qwik';
import { delay } from '../streaming/demo';

export const Render = component$(() => {
  const parent = {
    counter: {
      count: 0,
    },
    children: [] as any[],
  };
  parent.children.push(parent);

  const state = useStore(parent, { recursive: true });
  return (
    <>
      <button
        id="increment"
        onClick$={() => {
          state.counter.count++;
        }}
      >
        Increment
      </button>
      <Child counter={state.counter}></Child>
      <Issue1475 />
      <CounterToggle />
    </>
  );
});

export const Child = component$((props: { counter: { count: number } }) => {
  const state = useStore({
    hideAttributes: false,
  });
  useStylesScoped$(`
  .even::before{
    content: "even"
  }
  .odd::after{
    content: "odd"
  }
  `);

  if (state.hideAttributes) {
    const count = props.counter.count;
    return (
      <>
        <span>Rerender {count}</span>
        <div id="attributes">
          <button id="toggle" onClick$={() => (state.hideAttributes = !state.hideAttributes)}>
            Toggle attributes
          </button>
        </div>
      </>
    );
  }
  const count = props.counter.count;
  return (
    <>
      <span>Rerender {count}</span>
      <div
        id="attributes"
        preventdefault:click
        autoCorrect="all"
        aria-hidden="true"
        class={{
          even: count % 2 === 0,
          odd: count % 2 === 1,
          stable0: true,
          hidden: false,
        }}
      >
        <button id="toggle" onClick$={() => (state.hideAttributes = !state.hideAttributes)}>
          Toggle attributes
        </button>
      </div>
    </>
  );
});

export const Issue1475 = component$(() => {
  const render = useSignal(false);
  return (
    <>
      <button id="issue-1475-button" onClick$={() => (render.value = true)}>
        Render
      </button>
      <div id="issue-1475-result">
        {render.value ? (
          <>
            <h1>1. Before</h1>
            2. Some text
            <LazyIssue1475 />
            {'\n'}
            <h2>3 After</h2>
            <p>Stuff</p>
          </>
        ) : (
          <>
            <h1>Welcome</h1>
            <ul></ul>
            <h2>Here</h2>
          </>
        )}
      </div>
    </>
  );
});

export const LazyIssue1475 = component$(() => {
  useWatch$(async () => {
    await delay(50);
  });

  return <div>Middle</div>;
});

export const CounterToggle = component$(() => {
  const cond = useSignal({ cond: true });
  return (
    <>
      <button id="counter-toggle-btn" onClick$={() => (cond.value = { cond: !cond.value.cond })}>
        Toggle
      </button>
      {cond.value.cond ? <CounterToggleShow text="even" /> : <CounterToggleShow text="odd" />}
      <CounterToggleShow2 cond={cond.value.cond} />
    </>
  );
});

export const CounterToggleShow = component$((props: { text: string }) => {
  return (
    <>
      <div id="counter-toggle-show">{props.text}</div>
    </>
  );
});

export const CounterToggleShow2 = component$((props: { cond: boolean }) => {
  return (
    <>
      <div id="counter-toggle-show-2">{String(props.cond)}</div>
    </>
  );
});
