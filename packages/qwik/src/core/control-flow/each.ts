import type { PublicProps } from '../shared/component.public';
import { qTest } from '../shared/utils/qdev';
import type { DevJSX, JSXOutput } from '../shared/jsx/types/jsx-node';
import type { QRL } from '../shared/qrl/qrl.public';
import { tryGetInvokeContext } from '../use/use-core';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { isServerPlatform } from '../shared/platform/platform';
import { component$ } from '../shared/component.public';
import { useTask$ } from '../use/use-task-dollar';
import { isServer } from '@qwik.dev/core/build';
import { SkipRender } from '../shared/jsx/utils.public';

export interface EachProps<T, ITEM extends JSXOutput = JSXOutput> {
  items: readonly T[];
  item$: QRL<(item: T, index: number) => ITEM>;
  key$: QRL<(item: T, index: number) => string>;
}

export type EachComponent = <T, ITEM extends JSXOutput = JSXOutput>(
  props: PublicProps<EachProps<T, ITEM>>,
  key: string | null,
  flags: number,
  dev?: DevJSX
) => JSXOutput;

/** @public @experimental */
export const Each = /*#__PURE__*/ component$<EachProps<any>>((props) => {
  if (!__EXPERIMENTAL__.each) {
    throw new Error(
      'Each is experimental and must be enabled with `experimental: ["each"]` in the `qwikVite` plugin.'
    );
  }
  useTask$(async ({ track }) => {
    track(() => props.items);
    const context = tryGetInvokeContext()!;
    const host = context.$hostElement$!;
    const container = context.$container$!;
    const renderPromise = markVNodeDirty(container, host, ChoreBits.RECONCILE);
    const isSsr = qTest ? isServerPlatform() : isServer;
    if (isSsr) {
      await renderPromise;
    }
  });
  return SkipRender;
}) as EachComponent;
