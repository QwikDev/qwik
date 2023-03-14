import {
  component$,
  JSXNode,
  PropFunction,
  useSignal,
  useStore,
  useStylesScoped$,
  useTask$,
} from '@builder.io/qwik';
import { delay } from '../streaming/demo';

export const Render = component$(() => {
  const parent = {
    counter: {
      count: 0,
    },
    count: 0,
    children: [] as any[],
  };
  parent.children.push(parent);

  const state = useStore(parent, { deep: true });
  return (
    <>
      <button
        id="increment"
        onClick$={() => {
          state.counter.count++;
          state.count++;
        }}
      >
        Increment
      </button>
      <Child counter={state.counter}></Child>
      <Issue1475 />
      <Issue2563 />
      <Issue2608 />
      <Issue2800 />
      <Issue2889 />
      <Issue3116 />
      <CounterToggle />

      <PropsDestructuring
        message="Hello"
        count={state.count}
        id="props-destructuring"
        aria-hidden="true"
      />

      <PropsDestructuringNo count={state.count} id="props-destructuring-no" aria-hidden="true" />

      <PropsDestructuring
        message="Count"
        count={state.count}
        id="props-destructuring-count"
        aria-count={state.count}
      />

      <IssueReorder />
      <Issue2414 />
      <Issue3178 />
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
        <span id="rerenders">Rerender {count}</span>
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
      <span id="rerenders">Rerender {count}</span>
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
  useTask$(async () => {
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

export const PropsDestructuring = component$(
  ({ message, id, count: c, ...rest }: Record<string, any>) => {
    const renders = useStore(
      { renders: 0 },
      {
        reactive: false,
      }
    );
    renders.renders++;
    const rerenders = renders.renders;

    return (
      <div id={id}>
        <span {...rest}>
          {message} {c}
        </span>
        <div class="renders">{rerenders}</div>
      </div>
    );
  }
);

export const PropsDestructuringNo = component$(
  ({ message = 'Default', count, id, ...rest }: Record<string, any>) => {
    const renders = useStore(
      { renders: 0 },
      {
        reactive: false,
      }
    );
    renders.renders++;
    const rerenders = renders.renders;
    return (
      <div id={id}>
        <span {...rest}>
          {message} {count}
        </span>
        <div class="renders">{rerenders}</div>
      </div>
    );
  }
);

export const Issue2563 = component$(() => {
  const html = `hola`;
  const obj = { length: 4 };
  return (
    <ul>
      <li id="issue-2563-string">4={html.length}</li>
      <li id="issue-2563-obj">4={obj.length}</li>
      <li id="issue-2563-operation">4+1={html.length + 1}</li>
    </ul>
  );
});

export const Issue2608 = component$(() => {
  const show = useSignal(false);
  return (
    <>
      <button id="issue-2608-btn" onClick$={() => (show.value = !show.value)}>
        Toggle
      </button>
      {show.value && <div>Content</div>}
      <div>
        <input id="issue-2608-input" type="text" />
      </div>
    </>
  );
});

export const Issue2800 = component$(() => {
  const store = useStore<Record<string, number>>({
    alpha: 1,
    bravo: 2,
    charlie: 3,
  });

  return (
    <div>
      <button
        id="issue-2800-btn"
        onClick$={() => {
          const keys = Object.keys(store);
          store[`extra${keys.length}`] = 1;
        }}
      >
        Add key
      </button>
      <ul id="issue-2800-result">
        {Object.entries(store).map(([key, value]) => (
          <li key={key}>
            {key} - {value}
          </li>
        ))}
      </ul>
    </div>
  );
});

export const Issue2889 = component$(() => {
  const appState = useStore(
    {
      events: [
        { created: new Date(2022, 1, 15), count: 2 },
        { created: new Date(2022, 1, 18), count: 8 },
        { created: new Date(2022, 1, 21), count: 3 },
        { created: new Date(2022, 1, 26), count: 6 },
      ],
    },
    { deep: true }
  );

  const filteredEvents = useSignal<{ created: Date; count: number }[]>();

  useTask$(({ track }) => {
    const list = track(() => appState.events);
    filteredEvents.value = list.filter((x) => x.created >= new Date(2022, 1, 20));
  });

  return (
    <>
      <h2 id="issue-2889-result1">Deeds: {appState.events.length}</h2>
      <h2 id="issue-2889-result2">Filtered Deeds: {(filteredEvents.value || []).length}</h2>
    </>
  );
});

type Product = string;

export type ProductRelationProps = {
  render$: PropFunction<(products: Product[]) => JSXNode>;
};

export const ProductRelations = component$((props: ProductRelationProps) => {
  return <div>{props.render$(['this comes from render$'])}</div>;
});

export const Issue3116 = component$(() => {
  return (
    <>
      <ProductRelations
        render$={(products) => <div id="issue-3116-result">{products.join('hi')}</div>}
      />
    </>
  );
});

export const IssueReorder = component$(() => {
  const cond = useSignal(false);

  return (
    <div>
      {!cond.value && (
        <p id="running" class="issue-order">
          TOP
        </p>
      )}

      <div class="issue-order" data-value="first">
        1. First
      </div>
      <div class="issue-order" data-value="second">
        2. Second
      </div>

      {cond.value && (
        <p id="form-error" class="issue-order">
          BOTTOM
        </p>
      )}
      <button
        id="issue-order-btn"
        type="button"
        onClick$={() => {
          cond.value = true;
        }}
      >
        Submit
      </button>
    </div>
  );
});

const Issue2414 = component$(() => {
  const sort = useSignal<'id' | 'size' | 'age'>('size');
  const showTable = useSignal(true);
  const table = useStore({
    value: [
      { id: 1, size: 4, age: 1 },
      { id: 2, size: 3, age: 3 },
      { id: 3, size: 2, age: 27 },
      { id: 4, size: 1, age: 9 },
      { id: 5, size: 7, age: 21 },
      { id: 6, size: 8, age: 12 },
      { id: 7, size: 9, age: 7 },
    ],
  });

  useTask$(({ track }) => {
    track(() => sort.value);
    table.value = table.value.sort((a, b) => a[sort.value] - b[sort.value]).slice();
  });

  return (
    <>
      <p>Should be currently sorted by: {sort.value}</p>
      <table>
        <thead>
          {(['size', 'age', 'id'] as const).map((c) => {
            return (
              <th
                key={c}
                id={`issue-2414-${c}`}
                onClick$={(e) => {
                  sort.value = c;
                }}
              >
                {c}
              </th>
            );
          })}
        </thead>
        {showTable.value ? (
          <tbody>
            {table.value.map((row) => {
              return (
                <tr key={row.id}>
                  <td class="issue-2414-size">{row.size}</td>
                  <td class="issue-2414-age">{row.age}</td>
                  <td class="issue-2414-id">{row.id}</td>
                </tr>
              );
            })}
          </tbody>
        ) : (
          <></>
        )}
      </table>
    </>
  );
});

const Issue3178 = component$(() => {
  const store = useStore(
    {
      elements: [] as Element[],
    },
    { deep: true }
  );

  return (
    <>
      <div
        id="issue-3178"
        ref={(el) => {
          store.elements.push(el);
          console.warn(store.elements[0].nodeType);
        }}
      >
        Hello
      </div>
    </>
  );
});
