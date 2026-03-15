import {
  component$,
  createContextId,
  event$,
  isServer,
  jsx,
  SkipRender,
  Slot,
  useContext,
  useContextProvider,
  useSignal,
  useStore,
  useStylesScoped$,
  useTask$,
  type JSXOutput,
  type PropsOf,
  type QRL,
  type Signal,
} from "@qwik.dev/core";
import { h, SSRComment, SSRRaw } from "@qwik.dev/core/internal";
import { delay } from "../streaming/demo";

export const Render = component$(() => {
  const rerender = useSignal(0);
  return (
    <>
      <button
        id="rerender"
        data-v={rerender.value}
        onClick$={() => rerender.value++}
      >
        Rerender
      </button>
      <RenderChildren v={rerender.value} key={rerender.value} />
    </>
  );
});
export const RenderChildren = component$<{ v: number }>(({ v }) => {
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
      <div id="rerenderCount">Render {v}</div>
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
      <InlineJsxComponentOrderIssue1475 />
      <BindingsNotPrintingIssue2563 />
      <BrokenRenderingBehaviorIssue2608 />
      <StoreNewKeyReactivityIssue2800 />
      <DateSerializationDeepStoreIssue2889 />
      <PropRenderFunctionIssue3116 />
      <CounterToggle />
      <PropsDestructuring
        message="Hello"
        count={state.count}
        id="props-destructuring"
        aria-hidden="true"
      />
      <PropsDestructuringNo
        count={state.count}
        id="props-destructuring-no"
        aria-hidden="true"
      />
      <PropsDestructuring
        message="Count"
        count={state.count}
        id="props-destructuring-count"
        aria-count={state.count}
      />
      <IssueReorder />
      <ArrayItemsDisplayOrderIssue2414 />
      <ProxyOwnKeysSymbolIssue3178 />
      <DynamicElementTagSetPropertyIssue3398 />
      <ClickHandlersExecutedMultipleTimesIssue3479 />
      <SpreadReplacesExistingPropsIssue3481 />
      <ReactImportKeySpreadLoopIssue3468 />
      <Pr3475 />
      <DestructuringAssignmentBrokenIssue3561 />
      <UndefinedVariableAfterUpgradeIssue3542 atom={{ code: 1 }} />
      <ForLoopItemsAccumulateIssue3643 />
      <IssueChildrenSpread />
      <WrongDynamicListRenderingIssue3731 />
      <OptimizerSyntaxErrorConditionalIssue3702 />
      <VariableAssignmentsOptimizedIssue3795 />
      <DynamicComponentsWithSignalsIssue4029 />
      <UndefinedRefPropIssue4346 />
      <SkipRenderTest />
      <SSRRawTest />
      <ProxyOwnKeysDuplicateEntriesIssue4292 />
      <OptimizerRemovesLocalConstIssue4386 />
      <RangeInputInitialValueStepIssue4455 />
      <DynamicTagBreaksReactivityIssue5266 />
      <DynamicButton id="dynamic-button" />;
      <RerenderOnce />
      <PropSpreadLogicBrokenCsrIssue8213 />
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
          <button
            id="toggle"
            onClick$={() => (state.hideAttributes = !state.hideAttributes)}
          >
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
        <button
          id="toggle"
          onClick$={() => (state.hideAttributes = !state.hideAttributes)}
        >
          Toggle attributes
        </button>
      </div>
    </>
  );
});

export const InlineJsxComponentOrderIssue1475 = component$(() => {
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
            <LazyInlineJsxComponentOrderIssue1475 />
            {"\n"}
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

export const LazyInlineJsxComponentOrderIssue1475 = component$(() => {
  useTask$(async () => {
    await delay(50);
  });

  return <div>Middle</div>;
});

export const CounterToggle = component$(() => {
  const cond = useSignal({ cond: true });
  return (
    <>
      <button
        id="counter-toggle-btn"
        onClick$={() => (cond.value = { cond: !cond.value.cond })}
      >
        Toggle
      </button>
      {cond.value.cond ? (
        <CounterToggleShow text="even" />
      ) : (
        <CounterToggleShow text="odd" />
      )}
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
      },
    );
    renders.renders++;
    const rerenders = renders.renders + 0;

    return (
      <div id={id}>
        <span {...rest}>
          {message} {c}
        </span>
        <div class="renders">{rerenders}</div>
      </div>
    );
  },
);

export const PropsDestructuringNo = component$(
  ({ message = "Default", count, id, ...rest }: Record<string, any>) => {
    const renders = useStore(
      { renders: 0 },
      {
        reactive: false,
      },
    );
    renders.renders++;
    const rerenders = renders.renders + 0;
    return (
      <div id={id}>
        <span {...rest}>
          {message} {count}
        </span>
        <div class="renders">{rerenders}</div>
      </div>
    );
  },
);

export const BindingsNotPrintingIssue2563 = component$(() => {
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

export const BrokenRenderingBehaviorIssue2608 = component$(() => {
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

export const StoreNewKeyReactivityIssue2800 = component$(() => {
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

export const DateSerializationDeepStoreIssue2889 = component$(() => {
  const appState = useStore(
    {
      events: [
        { created: new Date(2022, 1, 15), count: 2 },
        { created: new Date(2022, 1, 18), count: 8 },
        { created: new Date(2022, 1, 21), count: 3 },
        { created: new Date(2022, 1, 26), count: 6 },
      ],
    },
    { deep: true },
  );

  const filteredEvents = useSignal<{ created: Date; count: number }[]>();

  useTask$(({ track }) => {
    const list = track(() => appState.events);
    filteredEvents.value = list.filter(
      (x) => x.created >= new Date(2022, 1, 20),
    );
  });

  return (
    <>
      <h2 id="issue-2889-result1">Deeds: {appState.events.length}</h2>
      <h2 id="issue-2889-result2">
        Filtered Deeds: {(filteredEvents.value || []).length}
      </h2>
    </>
  );
});

type Product = string;

export type ProductRelationProps = {
  render$: QRL<(products: Product[]) => JSXOutput>;
};

export const ProductRelations = component$((props: ProductRelationProps) => {
  return <div>{props.render$(["this comes from render$"])}</div>;
});

export const PropRenderFunctionIssue3116 = component$(() => {
  return (
    <>
      <ProductRelations
        render$={(products) => (
          <div id="issue-3116-result">{products.join("hi")}</div>
        )}
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

const ArrayItemsDisplayOrderIssue2414 = component$(() => {
  const sort = useSignal<"id" | "size" | "age">("size");
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
    table.value = table.value
      .sort((a, b) => a[sort.value] - b[sort.value])
      .slice();
  });

  return (
    <>
      <p>Should be currently sorted by: {sort.value}</p>
      <table>
        <caption>Hello</caption>
        <colgroup></colgroup>
        <thead>
          <tr>
            {(["size", "age", "id"] as const).map((c) => {
              return (
                <th
                  key={c}
                  id={`issue-2414-${c}`}
                  onClick$={() => {
                    sort.value = c;
                  }}
                >
                  {c}
                </th>
              );
            })}
          </tr>
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
        <tfoot>
          <tr>
            <td colSpan={3}>
              {table.value === undefined ? "" : table.value.length}
            </td>
          </tr>
        </tfoot>
      </table>
    </>
  );
});

const ProxyOwnKeysSymbolIssue3178 = component$(() => {
  const store = useStore(
    {
      elements: [] as Element[],
    },
    { deep: true },
  );

  return (
    <>
      <div
        id="issue-3178"
        ref={(el) => {
          store.elements.push(el);
          // console.warn(store.elements[0].nodeType);
        }}
      >
        Hello
      </div>
    </>
  );
});

export type TitleProps = {
  tag?: "h1" | "h2";
};

export const Title = component$((props: TitleProps) => {
  const Tag = props.tag ?? "h1";

  return <Tag id="issue-3398-tag">Hello {Tag}</Tag>;
});

export const DynamicElementTagSetPropertyIssue3398 = component$(() => {
  const tag = useSignal<"h1" | "h2">("h1");
  return (
    <div>
      <button
        id="issue-3398-button"
        onClick$={() => (tag.value = tag.value === "h1" ? "h2" : "h1")}
      >
        Toggle tag
      </button>
      <Title tag={tag.value}></Title>
    </div>
  );
});

export const ClickHandlersExecutedMultipleTimesIssue3479 = component$(() => {
  const count = useSignal(0);
  const attributes = {
    onClick$: event$(() => count.value++),
  };
  const countStr = String(count.value) + "";
  return (
    <div>
      <button id="issue-3479-button" {...attributes}>
        Increment
      </button>
      <div id="issue-3479-result">{countStr}</div>
    </div>
  );
});

export const SpreadReplacesExistingPropsIssue3481 = component$(() => {
  useStylesScoped$(`
    .from-static {
      color: red;
    }
    .from-attr {
      color: blue;
    }
  `);
  const attr: Record<string, string> = {
    class: "from-attr",
  };
  const count = useSignal(0);
  const countStr = String(count.value) + "";
  return (
    <>
      <button id="issue-3481-button" onClick$={() => count.value++}>
        Rerender
      </button>
      <div id="issue-3481-result1" class="from-static" {...attr}>
        Hello {countStr}
      </div>
      <div id="issue-3481-result2" {...attr} class="from-static">
        Hello {countStr}
      </div>
    </>
  );
});

const DATA = [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }];

export const Card = component$((props: any) => {
  return (
    <div class="issue-3468-card">
      {props.name}:{props.key}
    </div>
  );
});

export const ReactImportKeySpreadLoopIssue3468 = component$(() => {
  return (
    <>
      {DATA.map((post) => (
        <Card {...post} key={post.name} />
      ))}
    </>
  );
});

export const Pr3475 = component$(() =>
  ((store) => (
    <button id="pr-3475-button" onClick$={() => delete store.key}>
      {store.key}
    </button>
  ))(useStore<{ key?: string }>({ key: "data" })),
);

export const DestructuringAssignmentBrokenIssue3561 = component$(() => {
  const props = useStore({
    product: {
      currentVariant: {
        variantImage: "image",
        variantNumber: "number",
        setContents: "contents",
      },
    },
  });
  const { currentVariant: { variantImage, variantNumber, setContents } = {} } =
    props.product;

  return (
    <div>
      <div>
        <div>{variantImage}</div>
      </div>
      <div>
        <div>{variantNumber}</div>
      </div>
      <div>
        <div>{setContents}</div>
      </div>
    </div>
  );
});

export const UndefinedVariableAfterUpgradeIssue3542 = component$(
  ({ atom }: any) => {
    let status = atom.status;
    if (atom.code === 1) {
      status = "CODE IS 1";
    }
    return <span id="issue-3542-result">{status}</span>;
  },
);

export const ForLoopItemsAccumulateIssue3643 = component$(() => {
  const toggle = useSignal(false);
  return (
    <div>
      <button
        id="issue-3643-button"
        onClick$={() => (toggle.value = !toggle.value)}
      >
        Toggle
      </button>
      <div id="issue-3643-result">
        {toggle.value
          ? h("div", {}, "World")
          : h("div", { dangerouslySetInnerHTML: "Hello" })}
      </div>
      <div id="issue-3643-result-2">
        {toggle.value
          ? jsx("div", { children: "World" })
          : jsx("div", { dangerouslySetInnerHTML: "Hello" })}
      </div>
    </div>
  );
});

function Hola(props: any) {
  return <div {...props}></div>;
}

export const IssueChildrenSpread = component$(() => {
  const signal = useSignal({
    type: "div",
    children: ["Hello"],
  });
  const Type = signal.value.type;
  return (
    <div>
      <button
        id="issue-children-spread-button"
        onClick$={() => {
          signal.value = {
            type: "div",
            children: ["Changed"],
          };
        }}
      >
        Change
      </button>
      <Hola id="issue-children-spread-static">
        <div>1</div>
        <div>2</div>
      </Hola>
      <div id="issue-children-spread-result">
        <Type {...(signal.value as any)}></Type>
      </div>
    </div>
  );
});

const states = [
  ["think", "containers", "hydrating", "usestylesscoped", "slots"],
  ["think", "containers", "cleanup", "usevisibletask", "hydrating"],
  ["cleanup", "usevisibletask", "think", "containers", "slots"],
];

export const WrongDynamicListRenderingIssue3731 = component$(() => {
  const state = useSignal(0);
  const signal = useSignal(states[0]);
  return (
    <div>
      <button
        id="issue-3731-button"
        onClick$={() => {
          state.value++;
          if (state.value > states.length - 1) {
            state.value = 0;
          }
          signal.value = states[state.value];
        }}
      >
        Change
      </button>
      <ul>
        {signal.value.map((item) => {
          return (
            <WrongDynamicListRenderingIssue3731Child
              key={item}
              value={item}
            ></WrongDynamicListRenderingIssue3731Child>
          );
        })}
      </ul>
    </div>
  );
});

export const WrongDynamicListRenderingIssue3731Child = component$(
  (props: any) => {
    return <div class="issue-3731-result">{props.value}</div>;
  },
);

export const OptimizerSyntaxErrorConditionalIssue3702 = component$(
  ({ description = "", other }: any) => {
    const counter = useSignal(0);
    return (
      <div
        id="issue-3702-result"
        data-title={
          description && "description" in other
            ? `Hello ${counter.value}`
            : `Bye ${counter.value}`
        }
      >
        OptimizerSyntaxErrorConditionalIssue3702
        <button id="issue-3702-button" onClick$={() => counter.value++}>
          Increment
        </button>
      </div>
    );
  },
);

export const VariableAssignmentsOptimizedIssue3795 = component$(() => {
  let base = "foo";
  const firstAssignment = base;
  base += "bar";
  const secondAssignment = base;
  return (
    <div id="issue-3795-result">
      {firstAssignment} {secondAssignment}
    </div>
  );
});

export const DynamicComponentsWithSignalsIssue4029 = component$(() => {
  const Comp = useSignal<any>(CompA);
  return (
    <>
      <button id="issue-4029-toggle" onClick$={() => (Comp.value = CompB)}>
        toggle
      </button>
      <Comp.value />
    </>
  );
});

export const CompA = component$(() => <div id="issue-4029-result">CompA</div>);
export const CompB = component$(() => <div id="issue-4029-result">CompB</div>);

export const SkipRenderTest = component$(() => {
  const count = useSignal(0);
  if (count.value % 3 !== 0) {
    return SkipRender;
  }
  const countV = count.value + "";
  return (
    <>
      <button id="skip-render-button" onClick$={() => count.value++}>
        Increment {countV}
      </button>
      <div id="skip-render-result">Number: {count.value}</div>
    </>
  );
});

export const SSRRawTest = component$(() => {
  return (
    <div
      id="ssr-raw-test-result"
      data-mounted={isServer ? "server" : "browser"}
    >
      <SSRComment data="q:container=html" />
      <SSRRaw data="<b>ssr raw test</b>" />
      <SSRComment data="/q:container" />
    </div>
  );
});

type A = PropsOf<"button">;

export interface TestAProps extends A {}

export const TestA = component$<TestAProps>((props) => {
  return (
    <button id="issue-4292-result" type="button" {...props}>
      <Slot />
    </button>
  );
});

export interface TestBProps extends TestAProps {}

export const TestB = component$<TestBProps>((props) => {
  return (
    <TestA {...props}>
      <Slot />
    </TestA>
  );
});

export const ProxyOwnKeysDuplicateEntriesIssue4292 = component$(() => {
  const $toggled = useSignal<boolean>(false);

  return (
    <>
      <h1>Playground</h1>

      <TestB
        aria-label={$toggled.value ? "a" : "a1"}
        title={$toggled.value ? "a" : "a1"}
        onClick$={() => {
          $toggled.value = !$toggled.value;
        }}
      >
        <span>Hello, World!</span>
      </TestB>
    </>
  );
});

export const UndefinedRefPropIssue4346 = component$(() => {
  const toggle = useSignal(true);
  const ref = useSignal<HTMLDivElement>();

  return (
    <>
      <div id="issue-4346-result" ref={toggle.value ? ref : undefined}>
        {toggle.value ? "Hello" : "world"}
      </div>
      <button
        id="issue-4346-toggle"
        onClick$={() => (toggle.value = false)}
      ></button>
    </>
  );
});

export const FOO_MAPPING = {
  A: 1,
  B: 2,
  C: 3,
};

export const OptimizerRemovesLocalConstIssue4386 = component$(() => {
  const key = "A";
  const value = FOO_MAPPING[key];

  return <div id="issue-4386-result">{value}</div>;
});

export const RangeInputInitialValueStepIssue4455 = component$(() => {
  return (
    <>
      <input
        id="issue-4455-input1"
        type="range"
        value="0.5"
        step="0.1"
        min="0"
        max="1"
      />
      <input
        id="issue-4455-input2"
        type="range"
        step="0.1"
        value="0.5"
        min="0"
        max="1"
      />
    </>
  );
});

export const DynamicComponent = component$<{ b?: boolean; v: string }>(
  ({ b, v }) => {
    // Make the tag dynamic
    const Tag = b ? "button" : "div";
    return (
      <Tag id="issue-5266-tag" data-v={v}>
        hello
      </Tag>
    );
  },
);
export const DynamicTagBreaksReactivityIssue5266 = component$(() => {
  const show = useSignal(false);
  const state = useSignal("foo");
  return (
    <div>
      <button id="issue-5266-render" onClick$={() => (show.value = true)} />
      <button id="issue-5266-button" onClick$={() => (state.value = "bar")}>
        toggle
      </button>
      {show.value && <DynamicComponent v={state.value} />}
    </div>
  );
});

// needs to be a variable outside component scope to trigger the bug
const buttonStyle = "btn";
export const DynamicButton = component$<any>(
  ({ isWhite, href, onClick$, id }: any) => {
    const ComponentName = href ? "a" : "button";
    return (
      <ComponentName
        id={id}
        class={[buttonStyle, { white: isWhite }]}
        href={href}
        onClick$={onClick$}
      >
        <Slot />
      </ComponentName>
    );
  },
);

const globalObj = ["foo", "bar"];
const LogsProvider = createContextId<any[]>("logs");

const RerenderOnceChild = component$<{ obj: string; foo: Signal<number> }>(
  ({ obj, foo }) => {
    const logs = useContext(LogsProvider);
    logs.push("render Cmp", obj, foo.value);
    return <span id="rerender-once-child">{JSON.stringify(logs)}</span>;
  },
);

export const RerenderOnce = component$(() => {
  const foo = useSignal(0);
  const logs: any[] = [];
  useContextProvider(LogsProvider, logs);
  return (
    <div>
      <button
        id="rerender-once-button"
        onClick$={() => {
          foo.value === 0 ? (foo.value = 1) : (foo.value = 0);
        }}
      >
        click
      </button>
      <RerenderOnceChild obj={globalObj[foo.value]} foo={foo} />
    </div>
  );
});

const ctxId = createContextId<{
  isTitle: Signal<boolean>;
}>("my-PropSpreadLogicBrokenCsrIssue8213");
const PropSpreadLogicBrokenCsrIssue8213Render = component$(
  (props: any): JSXOutput => {
    const {
      fallback: _fallback,
      jsxType: _jsxType,
      movedProps,
      ...rest
    } = props;

    const Comp = (props.jsxType ?? props.fallback) as any;

    return (
      <Comp {...rest} {...movedProps}>
        <Slot />
      </Comp>
    );
  },
);
const PropSpreadLogicBrokenCsrIssue8213Child = component$(() => {
  const ctx = useContext(ctxId);
  useTask$(() => {
    ctx.isTitle.value = true;
  });
  return <Slot />;
});
const PropSpreadLogicBrokenCsrIssue8213Parent = component$((props: any) => {
  const { align: _align, ...rest } = props;
  const isTitle = useSignal(false);
  const titleId = `title`;
  useContextProvider(ctxId, {
    isTitle,
  });
  return (
    <>
      <PropSpreadLogicBrokenCsrIssue8213Render
        {...rest}
        fallback="div"
        id="issue-8213-render"
        aria-labelledby={isTitle.value ? titleId : undefined}
      >
        <Slot />
      </PropSpreadLogicBrokenCsrIssue8213Render>
    </>
  );
});
const PropSpreadLogicBrokenCsrIssue8213 = component$(() => {
  const toggle = useSignal(false);
  return (
    <div>
      <button
        id="issue-8213-button"
        onClick$={() => (toggle.value = !toggle.value)}
      >
        Toggle
      </button>
      {toggle.value && (
        <PropSpreadLogicBrokenCsrIssue8213Parent data-testid="root">
          <PropSpreadLogicBrokenCsrIssue8213Child>
            Child
          </PropSpreadLogicBrokenCsrIssue8213Child>
        </PropSpreadLogicBrokenCsrIssue8213Parent>
      )}
    </div>
  );
});
