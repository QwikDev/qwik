import { isBrowser } from '@qwik.dev/core/build';
import type { Signal } from '../reactive-primitives/signal.public';
import { createSignal } from '../reactive-primitives/signal.public';
import { componentQrl } from '../shared/component.public';
import { _jsxSorted } from '../shared/jsx/jsx-internal';
import { Slot } from '../shared/jsx/slot.public';
import { isServerPlatform } from '../shared/platform/platform';
import { inlinedQrl } from '../shared/qrl/qrl';
import { _captures } from '../shared/qrl/qrl-class';
import { createContextId, useContext, useContextProvider } from '../use/use-context';
import type { CursorBoundary } from '../use/use-cursor-boundary';
import { useConstant } from '../use/use-signal';
import { useTaskQrl, type TaskCtx } from '../use/use-task';

/** @public @experimental */
export type RevealOrder = 'parallel' | 'sequential' | 'reverse' | 'together';

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
  if (registration === null) {
    return true;
  }

  const reveal = registration.reveal;
  const current = registration.item;
  const items = reveal.items;
  reveal.version.value;

  switch (reveal.order) {
    case 'together':
      for (let i = 0; i < items.length; i++) {
        if (items[i].boundary.pending.untrackedValue > 0) {
          return false;
        }
      }
      return true;
    case 'sequential':
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item === current) {
          return true;
        }
        if (item.boundary.pending.untrackedValue > 0) {
          return false;
        }
      }
      return true;
    case 'reverse':
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item === current) {
          return true;
        }
        if (item.boundary.pending.untrackedValue > 0) {
          return false;
        }
      }
      return true;
    default:
      return true;
  }
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

/** @internal */
export const revealCmp = (props: RevealProps) => {
  if (!__EXPERIMENTAL__.suspense) {
    throw new Error(
      'Reveal is experimental and must be enabled with `experimental: ["suspense"]` in the `qwikVite` plugin.'
    );
  }

  const reveal = useConstant(createRevealContext, props);
  useContextProvider(RevealContext, reveal);

  return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, 'u7_0');
};

/** @public @experimental */
export const Reveal = /*#__PURE__*/ componentQrl<RevealProps>(
  /*#__PURE__*/ inlinedQrl(revealCmp, '_reC')
) as typeof revealCmp;
