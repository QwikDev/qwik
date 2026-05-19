import { Each, component$, useSignal, useStore } from '@qwik.dev/core';

interface KeyedItem {
  id: string;
  label: string;
}

const BASIC_ITEMS = ['a', 'b', 'c'];
const LONG_ITEMS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

const createInitialKeyedItems = (): KeyedItem[] => [
  { id: 'a', label: 'Hello a' },
  { id: 'b', label: 'Hello b' },
  { id: 'c', label: 'Hello c' },
];

const createUpdatedKeyedItems = (): KeyedItem[] => [
  { id: 'a', label: 'Hello a' },
  { id: 'b', label: 'Updated b' },
  { id: 'c', label: 'Hello c' },
];

const createRenderId = () => Math.random().toString(36).slice(2, 10);

export const EachRoot = component$(() => {
  const render = useSignal(0);

  return (
    <>
      <h1>Each</h1>
      <button id="force-rerender" data-v={render.value} onClick$={() => render.value++}>
        Rerender
      </button>
      <span id="render-count">{render.value}</span>
      <EachChildren key={render.value} />
    </>
  );
});

export const EachChildren = component$(() => {
  return (
    <>
      <RenderEachExamples />
      <SignalEachExamples />
      <StoreEachExamples />
    </>
  );
});

export const RenderEachExamples = component$(() => {
  return (
    <>
      <div id="render-basic-loop">
        <Each items={BASIC_ITEMS} key$={(item) => item} item$={(item) => <div>Hello {item}</div>} />
      </div>
      <div id="render-long-loop">
        <Each items={LONG_ITEMS} key$={(item) => item} item$={(item) => <div>Hello {item}</div>} />
      </div>
    </>
  );
});

export const SignalEachUpdate = component$(() => {
  const items = useSignal(BASIC_ITEMS);

  return (
    <>
      <div id="signal-update-loop">
        <Each items={items.value} key$={(item) => item} item$={(item) => <div>Hello {item}</div>} />
      </div>
      <button id="signal-update-button" onClick$={() => (items.value = ['d', 'e', 'f'])}>
        Update signal items
      </button>
    </>
  );
});

export const SignalEachKeyedNoop = component$(() => {
  const items = useSignal(createInitialKeyedItems());

  return (
    <>
      <div id="signal-keyed-loop">
        <Each
          items={items.value}
          key$={(item) => item.id}
          item$={(item) => (
            <div id={`signal-keyed-${item.id}`} data-render-id={createRenderId()}>
              {item.label}
            </div>
          )}
        />
      </div>
      <button
        id="signal-keyed-button"
        onClick$={() => {
          items.value = createUpdatedKeyedItems();
        }}
      >
        Update signal labels
      </button>
    </>
  );
});

export const SignalEachSwap = component$(() => {
  const items = useSignal(BASIC_ITEMS);

  return (
    <>
      <div id="signal-swap-loop">
        <Each
          items={items.value}
          key$={(item) => item}
          item$={(item) => (
            <div id={`signal-swap-${item}`} data-render-id={createRenderId()}>
              Hello {item}
            </div>
          )}
        />
      </div>
      <button
        id="signal-swap-button"
        onClick$={() => {
          items.value = ['c', 'b', 'a'];
        }}
      >
        Swap signal items
      </button>
    </>
  );
});

export const SignalEachExamples = component$(() => {
  return (
    <>
      <SignalEachUpdate />
      <SignalEachKeyedNoop />
      <SignalEachSwap />
    </>
  );
});

export const StoreEachUpdate = component$(() => {
  const items = useStore({
    value: BASIC_ITEMS,
  });

  return (
    <>
      <div id="store-update-loop">
        <Each items={items.value} key$={(item) => item} item$={(item) => <div>Hello {item}</div>} />
      </div>
      <button id="store-update-button" onClick$={() => (items.value = ['d', 'e', 'f'])}>
        Update store items
      </button>
    </>
  );
});

export const StoreEachKeyedNoop = component$(() => {
  const items = useStore({
    value: createInitialKeyedItems(),
  });

  return (
    <>
      <div id="store-keyed-loop">
        <Each
          items={items.value}
          key$={(item) => item.id}
          item$={(item) => (
            <div id={`store-keyed-${item.id}`} data-render-id={createRenderId()}>
              {item.label}
            </div>
          )}
        />
      </div>
      <button
        id="store-keyed-button"
        onClick$={() => {
          items.value = createUpdatedKeyedItems();
        }}
      >
        Update store labels
      </button>
    </>
  );
});

export const StoreEachSwap = component$(() => {
  const items = useStore({
    value: BASIC_ITEMS,
  });

  return (
    <>
      <div id="store-swap-loop">
        <Each
          items={items.value}
          key$={(item) => item}
          item$={(item) => (
            <div id={`store-swap-${item}`} data-render-id={createRenderId()}>
              Hello {item}
            </div>
          )}
        />
      </div>
      <button
        id="store-swap-button"
        onClick$={() => {
          items.value = ['c', 'b', 'a'];
        }}
      >
        Swap store items
      </button>
    </>
  );
});

export const StoreEachExamples = component$(() => {
  return (
    <>
      <StoreEachUpdate />
      <StoreEachKeyedNoop />
      <StoreEachSwap />
    </>
  );
});
