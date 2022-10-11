import { component$, useStore, useStylesScoped$ } from '@builder.io/qwik';

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
