import {
  $,
  component$,
  createContextId,
  jsx,
  Slot,
  useContext,
  useContextProvider,
  useSignal,
  useStore,
  useVisibleTask$,
  type FunctionComponent,
  type JSXNode,
  type Signal,
} from "@qwik.dev/core";

export const SlotParent = component$(() => {
  const state = useStore({
    disableButtons: false,
    disableNested: false,
    removeContent: false,
    render: true,
    count: 0,
  });
  const renderCount = useSignal(0);
  return (
    <section class="todoapp">
      {state.render && (
        <>
          <div id="isRendered">Hi</div>
          <DefaultSlotHidesSiblingsIssue1630>
            <Child id="slot-child" q:slot="slot-content">
              Component Slot Content
            </Child>
            <p q:slot="slot-content" id="slot-p">
              P Slot Content
            </p>
            <p id="noslot-p">Non-Slotted Content</p>
          </DefaultSlotHidesSiblingsIssue1630>
          <ModalSlotRerenderOnReopenIssue1410>
            <span id="modal-content">Model content</span>
          </ModalSlotRerenderOnReopenIssue1410>
          <DynamicSlotNameInsertBeforeIssue2688 count={state.count} />
          <Projector state={state} id="btn1">
            {!state.removeContent && <>DEFAULT {state.count}</>}
            <span q:slot="ignore">IGNORE</span>
          </Projector>

          <Projector state={state} id="btn2">
            {!state.removeContent && (
              <span q:slot="start">START {state.count}</span>
            )}
          </Projector>

          <Thing state={state} id="btn3">
            <Projector id="projected" state={state}>
              {!state.removeContent && <>INSIDE THING {state.count}</>}
            </Projector>
          </Thing>
          <NestedRoutesUseLocationErrorIssue2751 />

          <SlotNotAvailableViaUseContextIssue3565
            model={SlotNotAvailableViaUseContextIssue3565Model}
          />

          <AsyncSignalUpdateSlotContentIssue3607 />
          <RouteActionResultNavigationIssue3727 />
          <SvgIconSlotConditionalRenderIssue4215 />
          <ContentDuplicationDelayedVisibleTaskIssue4283>
            <p>index page</p>
          </ContentDuplicationDelayedVisibleTaskIssue4283>
          <ConditionalRootNodeLayoutBreaksIssue4658 />
          <ContextHiddenSlotBreaksSsrIssue5270 />
          <SlotProjectedContentNotUpdatingDomIssue5506 />
        </>
      )}
      <div>
        <button
          id="btn-toggle-content"
          class="border border-cyan-600"
          onClick$={() => (state.removeContent = !state.removeContent)}
        >
          Toggle content
        </button>
      </div>
      <div>
        <button
          id="btn-toggle-buttons"
          class="border border-cyan-600"
          onClick$={() => (state.disableButtons = !state.disableButtons)}
        >
          Toggle buttons
        </button>
      </div>
      <div>
        <button
          id="btn-toggle-thing"
          class="border border-cyan-600"
          onClick$={() => (state.disableNested = !state.disableNested)}
        >
          Toogle Thing
        </button>
      </div>
      <div>
        <button
          id="btn-count"
          class="border border-cyan-600"
          onClick$={() => state.count++}
        >
          Count
        </button>
      </div>
      <div>
        <button
          id="btn-toggle-render"
          class="border border-cyan-600"
          onClick$={() => {
            state.render = !state.render;
            renderCount.value++;
          }}
        >
          Toogle render
        </button>
      </div>
      <div id="slot-render-count">{renderCount.value}</div>
    </section>
  );
});

export const DefaultSlotHidesSiblingsIssue1630 = component$(() => {
  const store = useStore({ open: true });

  return (
    <>
      <button
        id="toggle-child-slot"
        onClick$={() => (store.open = !store.open)}
      >
        Toggle Non-Slotted Content
      </button>
      <Slot name="slot-content" />
      {store.open && <Slot />}
    </>
  );
});

export const Child = component$((props: { id?: string }) => {
  return (
    <p id={props.id}>
      <Slot />
    </p>
  );
});

export const ModalSlotRerenderOnReopenIssue1410 = component$(() => {
  const store = useStore({ open: true });

  return (
    <>
      <button id="toggle-modal" onClick$={() => (store.open = !store.open)}>
        Toggle modal
      </button>
      {store.open && (
        <>
          <Child>
            <Slot />
          </Child>
        </>
      )}
    </>
  );
});

export const Projector = component$((props: { state: any; id: string }) => {
  return (
    <div
      id={props.id}
      onClick$={() => {
        props.state.count--;
      }}
    >
      <Button>
        <Slot name="start"></Slot>

        {!props.state.disableButtons && (
          <span>
            <Slot />
          </span>
        )}
        <Slot name="end" />
      </Button>
    </div>
  );
});

export const Button = component$((props: { id?: string }) => {
  return (
    <div role="button" id={props.id}>
      <Slot />
    </div>
  );
});

export const Thing = component$((props: { state: any; id: string }) => {
  return (
    <article class="todoapp" id={props.id}>
      {!props.state.disableNested && <Slot />}
    </article>
  );
});

export const Switch = component$((props: { name: string }) => {
  return <Slot name={props.name} />;
});

export const DynamicSlotNameInsertBeforeIssue2688 = component$(
  ({ count }: { count: number }) => {
    const store = useStore({ flip: false });

    return (
      <>
        <button
          id="issue-2688-button"
          onClick$={() => (store.flip = !store.flip)}
        >
          Toggle switch
        </button>
        <div id="issue-2688-result">
          <Switch name={store.flip ? "b" : "a"}>
            <div q:slot="a">Alpha {count}</div>
            <div q:slot="b">Bravo {count}</div>
          </Switch>
        </div>
      </>
    );
  },
);

const NestedRoutesUseLocationErrorIssue2751Context = createContextId<
  Signal<number>
>("CleanupCounterContext");

export const NestedRoutesUseLocationErrorIssue2751 = component$(() => {
  const signal = useSignal(0);
  useContextProvider(NestedRoutesUseLocationErrorIssue2751Context, signal);

  return (
    <>
      <button
        id="issue-2751-toggle"
        onClick$={() => {
          signal.value++;
        }}
      >
        Toggle
      </button>
      <div id="issue-2751-result">
        {signal.value % 2 === 0 ? <CleanupA></CleanupA> : <div>Nothing</div>}
      </div>
    </>
  );
});

interface CleanupProps {
  slot?: boolean;
}
export const CleanupA = component$<CleanupProps>((props) => {
  return (
    <div>
      <Bogus />
      {props.slot && <Slot></Slot>}
    </div>
  );
});

export const Bogus = component$(() => {
  const signal = useContext(NestedRoutesUseLocationErrorIssue2751Context);
  const count = signal.value;
  return (
    <div>
      Bogus {count} {signal.value} <span>{signal.value}</span>
    </div>
  );
});

export const SlotNotAvailableViaUseContextIssue3565Model = component$(() => {
  return (
    <div id="issue-3565-result">
      Own content
      <Slot></Slot>
    </div>
  );
});

export const SlotNotAvailableViaUseContextIssue3565 = component$(
  ({ model: Model }: { model: string | FunctionComponent }) => {
    return (
      <>
        <Model>
          <div>content projected</div>
        </Model>
      </>
    );
  },
);

export const AsyncSignalUpdateSlotContentIssue3607 = component$(() => {
  const show = useSignal(false);
  return (
    <AsyncSignalUpdateSlotContentIssue3607Button
      loading={show.value}
      onClick$={() => {
        show.value = !show.value;
      }}
    >
      {show.value ? "Loading..." : "Load more"}
    </AsyncSignalUpdateSlotContentIssue3607Button>
  );
});

export const AsyncSignalUpdateSlotContentIssue3607Button = component$(
  ({ onClick$ }: any) => {
    return (
      <>
        <button id="issue-3607-result" onClick$={onClick$} class="btn">
          <Slot />
        </button>
      </>
    );
  },
);

const CTX = createContextId<Signal<any[]>>(
  "content-RouteActionResultNavigationIssue3727",
);

export const RouteActionResultNavigationIssue3727 = component$(() => {
  const content = useSignal<any[]>([
    RouteActionResultNavigationIssue3727ParentA,
    RouteActionResultNavigationIssue3727ChildA,
  ]);
  useContextProvider(CTX, content);

  const contentsLen = content.value.length;
  let cmp: JSXNode | null = null;
  for (let i = contentsLen - 1; i >= 0; i--) {
    cmp = jsx(content.value[i], {
      children: cmp,
    });
  }
  return cmp;
});

export const RouteActionResultNavigationIssue3727ParentA = component$(() => {
  return (
    <main id="Issue3727ParentA">
      <Slot />
    </main>
  );
});

export const RouteActionResultNavigationIssue3727ParentB = component$(() => {
  return (
    <main id="Issue3727ParentB">
      <Slot />
    </main>
  );
});

export const RouteActionResultNavigationIssue3727ChildA = component$(() => {
  const content = useContext(CTX);

  return (
    <article>
      <h1>First</h1>
      <button
        id="issue-3727-navigate"
        onClick$={() => {
          content.value = [
            RouteActionResultNavigationIssue3727ParentB,
            RouteActionResultNavigationIssue3727ChildB,
          ];
        }}
      >
        Navigate
      </button>
    </article>
  );
});

export const RouteActionResultNavigationIssue3727ChildB = component$(() => {
  const copyList = useSignal<string[]>([]);
  const content = useContext(CTX);
  return (
    <article>
      <h1>Second</h1>
      <button
        id="issue-3727-add"
        onClick$={async () => {
          content.value = [
            RouteActionResultNavigationIssue3727ParentB,
            RouteActionResultNavigationIssue3727ChildB,
          ];
          copyList.value = [...copyList.value, `item ${copyList.value.length}`];
        }}
      >
        Add item
      </button>
      <ul id="issue-3727-results">
        {copyList.value.map((item) => (
          <li>{item}</li>
        ))}
      </ul>
    </article>
  );
});

export const QwikSvgWithSlot = component$(() => {
  return (
    <svg
      id="issue-4215-svg"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "24px", height: "24px" }}
    >
      <Slot />
    </svg>
  );
});

export const SvgIconSlotConditionalRenderIssue4215 = component$(() => {
  const $visible = useSignal<boolean>(true);

  return (
    <>
      <button
        class="cta"
        id="issue-4215-toggle"
        onClick$={() => {
          $visible.value = !$visible.value;
        }}
      >
        Toggle icons
      </button>

      <div class="svg-container icon1">
        <p>QwikSvgWithSlot</p>
        <QwikSvgWithSlot>
          {$visible.value && (
            <path d="M14.71 6.71c-.39-.39-1.02-.39-1.41 0L8.71 11.3c-.39.39-.39 1.02 0 1.41l4.59 4.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L10.83 12l3.88-3.88c.39-.39.38-1.03 0-1.41z" />
          )}
        </QwikSvgWithSlot>
      </div>
    </>
  );
});

export const HideUntilVisible = component$(() => {
  const isNotVisible = useSignal(true);

  useVisibleTask$(
    () => {
      if (isNotVisible.value) {
        isNotVisible.value = false;
      }
    },
    {
      strategy: "document-ready",
    },
  );

  // NOTE: if you comment the line below,
  // there will only be one "Content"
  if (isNotVisible.value) {
    return <div></div>;
  }

  return (
    <div id="issue-4283-result">
      <p>Hide until visible</p>
      <Slot />
    </div>
  );
});

export const ContentDuplicationDelayedVisibleTaskIssue4283 = component$(() => {
  return (
    <HideUntilVisible>
      <p>Content</p>
      <Slot />
    </HideUntilVisible>
  );
});

export const ConditionalRootNodeLayoutBreaksIssue4658Context =
  createContextId<Signal<boolean>>("issue-4658-context");
export const ConditionalRootNodeLayoutBreaksIssue4658Inner = component$(() => {
  const toggle = useContext(ConditionalRootNodeLayoutBreaksIssue4658Context);
  return (
    <>
      <main>
        <Slot />
      </main>
      {toggle.value ? (
        <h3 id="issue-4658-inner">CCC</h3>
      ) : (
        <h3 id="issue-4658-inner">DDD</h3>
      )}
    </>
  );
});

export const ConditionalRootNodeLayoutBreaksIssue4658 = component$(() => {
  const toggle = useSignal(false);
  useContextProvider(ConditionalRootNodeLayoutBreaksIssue4658Context, toggle);
  return (
    <>
      <ConditionalRootNodeLayoutBreaksIssue4658Inner>
        {toggle.value ? (
          <h1 id="issue-4658-top">AAA</h1>
        ) : (
          <h1 id="issue-4658-top">BBB</h1>
        )}
      </ConditionalRootNodeLayoutBreaksIssue4658Inner>
      <button
        id="issue-4658-toggle"
        onClick$={() => {
          toggle.value = !toggle.value;
        }}
      >
        Toggle
      </button>
    </>
  );
});

const ContextHiddenSlotBreaksSsrIssue5270Context = createContextId<{
  hi: string;
}>("5270");
export const ProviderParent = component$(() => {
  useContextProvider(ContextHiddenSlotBreaksSsrIssue5270Context, {
    hi: "hello",
  });
  const s = useSignal(false);
  return (
    <div>
      <button id="issue-5270-button" onClick$={() => (s.value = !s.value)}>
        toggle
      </button>
      <br />
      {s.value && <Slot />}
    </div>
  );
});
const ContextChild = component$(() => {
  const t = useContext(ContextHiddenSlotBreaksSsrIssue5270Context);
  return <div id="issue-5270-div">Ctx: {t.hi}</div>;
});
export const ContextHiddenSlotBreaksSsrIssue5270 = component$(() => {
  useContextProvider(ContextHiddenSlotBreaksSsrIssue5270Context, {
    hi: "wrong",
  });
  return (
    <ProviderParent>
      <ContextChild />
    </ProviderParent>
  );
});

export const ToggleIssue5506 = component$<any>((props) => {
  return (
    <>
      <label>
        <input
          {...props}
          type="checkbox"
          // ensure it gets checked state only from props
          preventdefault:click
        />
        toggle me
      </label>
    </>
  );
});

export const SlotParentIssue5506 = component$(() => <Slot />);

// This breaks signal propagation, if you put this expression directly in the JSX prop it works
function coerceBoolean(value: string) {
  return value === "true";
}

export const SlotProjectedContentNotUpdatingDomIssue5506 = component$(() => {
  const sig = useSignal("true");
  const render = useSignal(0);
  const onClick$ = $(() => {
    const newValue = sig.value === "true" ? "false" : "true";
    sig.value = newValue;
  });

  return (
    <div id="issue-5506-div">
      <SlotParentIssue5506 key={render.value}>
        <ToggleIssue5506
          id="input-5506"
          checked={coerceBoolean(sig.value)}
          onClick$={onClick$}
        />
        <br />
        <button onClick$={() => render.value++}>Rerender on client</button>
      </SlotParentIssue5506>
    </div>
  );
});
