import { isBrowser } from '@qwik.dev/core/build';
import type { Signal } from '../reactive-primitives/signal.public';
import { createSignal } from '../reactive-primitives/signal.public';
import { componentQrl } from '../shared/component.public';
import { _jsxSorted } from '../shared/jsx/jsx-internal';
import { Fragment } from '../shared/jsx/jsx-runtime';
import { directGetPropsProxyProp } from '../shared/jsx/props-proxy';
import { Slot } from '../shared/jsx/slot.public';
import { isServerPlatform } from '../shared/platform/platform';
import { inlinedQrl } from '../shared/qrl/qrl';
import { _captures } from '../shared/qrl/qrl-class';
import { noSerialize, type NoSerialize } from '../shared/serdes/verify';
import { canRevealRegistration, type RevealOrder } from '../shared/utils/reveal';
import { createInternalServerComponent } from '../ssr/internal-server-component';
import { createContextId, useContext, useContextProvider } from '../use/use-context';
import type { CursorBoundary } from '../use/use-cursor-boundary';
import { useConstant } from '../use/use-signal';
import { useTaskQrl, type TaskCtx } from '../use/use-task';
import {
  createOutOfOrderRevealCoordinator,
  isOutOfOrderStreaming,
  type OutOfOrderRevealCoordinator,
} from './suspense-utils';

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

/** @internal */
export const revealCanReveal = () => {
  const registration = _captures![0] as RevealRegistration | null;
  // `version` is monotonic; the branch keeps the subscription read from being dropped by minifiers.
  if (registration !== null && registration.reveal.version.value < 0) {
    return false;
  }
  return canRevealRegistration(registration);
};

/** @internal */
export const revealCleanupTask = ({ cleanup }: TaskCtx) => {
  const registration = _captures![0] as RevealRegistration;
  cleanup(() => {
    // Keep the SSR registry intact so `reveal.items` serializes for resume.
    if (import.meta.env.TEST ? isServerPlatform() : !isBrowser) {
      return;
    }
    const items = registration.reveal.items;
    const index = items.indexOf(registration.item);
    if (index !== -1) {
      items.splice(index, 1);
      registration.reveal.version.value++;
    }
  });
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
    useTaskQrl(/*#__PURE__*/ inlinedQrl(revealCleanupTask, '_reT', [registration]), {
      deferUpdates: false,
    });
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

/** @internal */
export const revealCmp = (props: RevealProps) => {
  if (!__EXPERIMENTAL__.suspense) {
    throw new Error(
      'Reveal is experimental and must be enabled with `experimental: ["suspense"]` in the `qwikVite` plugin.'
    );
  }

  const reveal = useConstant(createRevealContext, props);
  useContextProvider(RevealContext, reveal);

  const isServerEnv = import.meta.env.TEST ? isServerPlatform() : !isBrowser;
  if (__EXPERIMENTAL__.suspense && isServerEnv && isOutOfOrderStreaming()) {
    const coordinator = getOutOfOrderCoordinator(reveal);
    return /*#__PURE__*/ _jsxSorted(
      Fragment,
      null,
      null,
      [
        /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, 'u7_0'),
        /*#__PURE__*/ _jsxSorted(
          SSRReveal,
          {
            coordinator,
          },
          null,
          null,
          0,
          'u7_1'
        ),
      ],
      1,
      'u7_2'
    );
  }

  return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, 'u7_0');
};

/** @public @experimental */
export const Reveal = /*#__PURE__*/ componentQrl<RevealProps>(
  /*#__PURE__*/ inlinedQrl(revealCmp, '_reC')
) as typeof revealCmp;

type SSRRevealProps = {
  coordinator: OutOfOrderRevealCoordinator;
};

const SSRReveal = __EXPERIMENTAL__.suspense
  ? /*#__PURE__*/ createInternalServerComponent<SSRRevealProps>((ssr, jsx) => {
      const coordinator = directGetPropsProxyProp<OutOfOrderRevealCoordinator, unknown>(
        jsx,
        'coordinator'
      );
      const script = coordinator.script();
      if (!script) {
        return;
      }
      ssr.emitOutOfOrderExecutorIfNeeded();
      ssr.emitInlineScript(script);
    })
  : null!;
