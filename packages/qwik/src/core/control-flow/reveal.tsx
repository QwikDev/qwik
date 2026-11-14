import { isBrowser } from '@qwik.dev/core/build';
import { qTest } from '../shared/utils/qdev';
import type { Signal } from '../reactive-primitives/signal.public';
import { createSignal } from '../reactive-primitives/signal.public';
import { component$, type Component } from '../shared/component.public';
import { _jsxSorted } from '../shared/jsx/jsx-internal';
import { Slot } from '../shared/jsx/slot.public';
import { isServerPlatform } from '../shared/platform/platform';
import { noSerialize, type NoSerialize } from '../shared/serdes/verify';
import type { RevealOrder } from '../shared/utils/reveal';
import { createInternalServerComponent } from '../ssr/internal-server-component';
import { createContextId, useContext, useContextProvider } from '../use/use-context';
import type { CursorBoundary } from '../use/use-cursor-boundary';
import { useConstant } from '../use/use-signal';
import { useTask$ } from '../use/use-task-dollar';
import {
  createOutOfOrderRevealCoordinator,
  isOutOfOrderStreaming,
  type OutOfOrderRevealCoordinator,
} from './pending-utils';

export type { RevealOrder } from '../shared/utils/reveal';

/** @public @experimental */
export type RevealProps = {
  order?: RevealOrder;
  collapsed?: boolean;
};

export type RevealItem = {
  boundary: CursorBoundary;
};

export type RevealContext = {
  order: RevealOrder;
  collapsed: boolean;
  items: RevealItem[];
  version: Signal<number>;
  ooos?: NoSerialize<OutOfOrderRevealCoordinator<RevealItem>>;
};

export type RevealRegistration = {
  reveal: RevealContext;
  item: RevealItem;
};

const RevealContext = /*#__PURE__*/ createContextId<RevealContext>('qk-reveal');

const createRevealContext = (props: RevealProps): RevealContext => {
  return {
    order: props.order ?? 'parallel',
    collapsed: props.collapsed === true,
    items: [],
    version: createSignal(0),
  };
};

export const useRevealBoundary = (boundary: CursorBoundary): RevealRegistration | null => {
  const reveal = useContext(RevealContext, null);
  const registration = useConstant(() => {
    if (reveal === null) {
      return null;
    }
    const item: RevealItem = { boundary };
    reveal.items.push(item);
    return { reveal, item };
  });

  if (registration !== null) {
    useTask$(
      ({ cleanup }) => {
        cleanup(() => {
          // Keep the SSR registry intact so `reveal.items` serializes for resume.
          if (qTest ? isServerPlatform() : !isBrowser) {
            return;
          }
          const items = registration.reveal.items;
          const index = items.indexOf(registration.item);
          if (index !== -1) {
            items.splice(index, 1);
            registration.reveal.version.value++;
          }
        });
      },
      {
        deferUpdates: false,
      }
    );
  }

  return registration;
};

const getOutOfOrderCoordinator = (
  reveal: RevealContext
): OutOfOrderRevealCoordinator<RevealItem> => {
  const coordinator = reveal.ooos;
  if (coordinator) {
    return coordinator;
  }
  const nextCoordinator = createOutOfOrderRevealCoordinator<RevealItem>(
    reveal.order,
    reveal.collapsed
  );
  reveal.ooos = noSerialize(nextCoordinator);
  return nextCoordinator;
};

/** @public @experimental */
export const Reveal: Component<RevealProps> = /*#__PURE__*/ component$<RevealProps>((props) => {
  if (!__EXPERIMENTAL__.pendingBoundary) {
    throw new Error(
      'Reveal is experimental and must be enabled with `experimental: ["pendingBoundary"]` in the `qwikVite` plugin.'
    );
  }

  const reveal = useConstant(createRevealContext, props);
  useContextProvider(RevealContext, reveal);

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  if (__EXPERIMENTAL__.pendingBoundary && isServerEnv && isOutOfOrderStreaming()) {
    const coordinator = getOutOfOrderCoordinator(reveal);
    return /*#__PURE__*/ _jsxSorted(
      SSRRevealSlot,
      {
        coordinator,
      },
      null,
      null,
      0,
      'u7_0'
    );
  }

  return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, 'u7_0');
});

type SSRRevealSlotProps = {
  coordinator: OutOfOrderRevealCoordinator;
};

const SSRRevealSlot = /*#__PURE__*/ createInternalServerComponent<SSRRevealSlotProps>(
  (ssr, jsx, _options, enqueue) => {
    const coordinator = jsx.varProps.coordinator as OutOfOrderRevealCoordinator;
    enqueue(() => {
      const script = coordinator.script();
      if (!script) {
        return;
      }
      ssr.emitOutOfOrderExecutorIfNeeded();
      ssr.emitInlineScript(script);
    });
    enqueue(/*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, 'u7_0'));
  }
);
