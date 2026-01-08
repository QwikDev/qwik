import {
  $,
  component$,
  createContextId,
  Slot,
  useConstant,
  useContext,
  useContextProvider,
  useSignal,
  useTask$,
  type PropsOf,
  type Signal,
} from "@qwik.dev/core";

export const QRL = component$(() => {
  return (
    <>
      <Cmp />
    </>
  );
});

type TriggerRef = Signal<HTMLButtonElement | undefined>;

export const tabsContextId = createContextId<TabsContext>("qds-tabs");

type TabsContext = {
  triggerRefs: Signal<TriggerRef[]>;
  selectedValueSig: Signal<string>;
  orientationSig: Signal<string>;
  loopSig: Signal<boolean>;
  selectOnFocus: boolean;
  currTriggerIndex: number;
  currContentIndex: number;
};

export type TabsTriggerProps = PropsOf<"button"> & {
  _index?: number;
  value?: string;
};

export type TabsRootProps = Omit<PropsOf<"div">, "align" | "onChange$"> & {
  value?: string;
  orientation?: "horizontal" | "vertical";
  loop?: boolean;
  onChange$?: (value: string) => void;
  selectOnFocus?: boolean;
};

export const TabsRoot = component$((props: TabsRootProps) => {
  const { selectOnFocus = true } = props;

  const triggerRefs = useSignal<TriggerRef[]>([]);
  const currTriggerIndex = 0;
  const currContentIndex = 0;

  const selectedValueSig = useSignal("0");
  const orientationSig = useSignal("horizontal");
  const loopSig = useSignal(false);

  const context: TabsContext = {
    triggerRefs,
    selectedValueSig,
    orientationSig,
    loopSig,
    selectOnFocus,
    currTriggerIndex,
    currContentIndex,
  };

  useContextProvider(tabsContextId, context);

  return (
    <div ui-qds-tabs-root>
      <Slot />
    </div>
  );
});

export const TabsTrigger = component$((props: TabsTriggerProps) => {
  const triggerRef = useSignal<HTMLButtonElement>();
  const context = useContext(tabsContextId);

  const currIndex = useConstant(() => {
    const currTriggerIndex = context.currTriggerIndex;
    context.currTriggerIndex++;

    return currTriggerIndex;
  });

  useTask$(function setIndexOrder() {
    const index = currIndex;
    if (index === undefined) return;

    context.triggerRefs.value[index] = triggerRef;
  });

  const handleSelect$ = $(() => {
    if (props.value) {
      context.selectedValueSig.value = props.value;
    } else {
      context.selectedValueSig.value = currIndex?.toString() ?? "No index";
    }
  });

  const handleNavigation$ = $((e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowRight": {
        context.triggerRefs.value[1].value?.focus();
        break;
      }
    }
  });

  return (
    <button
      ref={triggerRef}
      ui-qds-tabs-trigger
      role="tab"
      onFocus$={handleSelect$}
      onKeyDown$={handleNavigation$}
    >
      <Slot />
    </button>
  );
});

export const Cmp = component$(() => {
  return (
    <TabsRoot>
      <TabsTrigger>Tab 1</TabsTrigger>
      <TabsTrigger>Tab 2</TabsTrigger>
    </TabsRoot>
  );
});
