import type { PublicProps } from '../shared/component.public';
import { qTest } from '../shared/utils/qdev';
import type { DevJSX, JSXOutput } from '../shared/jsx/types/jsx-node';
import type { QRL } from '../shared/qrl/qrl.public';
import { inlinedQrl } from '../shared/qrl/qrl';
import { tryGetInvokeContext } from '../use/use-core';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { isServerPlatform } from '../shared/platform/platform';
import { componentQrl } from '../shared/component.public';
import { type TaskCtx, useTaskQrl } from '../use/use-task';
import { isServer } from '@qwik.dev/core/build';
import { SkipRender } from '../shared/jsx/utils.public';
import { _captures } from '../shared/qrl/qrl-class';

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

/** @internal */
export const eachCmpTask = async ({ track }: TaskCtx) => {
  const props = _captures![0] as EachProps<any>;
  track(() => props.items);
  const context = tryGetInvokeContext()!;
  const host = context.$hostElement$!;
  const container = context.$container$!;
  markVNodeDirty(container, host, ChoreBits.RECONCILE);
  const isSsr = qTest ? isServerPlatform() : isServer;
  if (isSsr) {
    await container.$renderPromise$;
  }
};

/** @internal */
export const eachCmp = (props: EachProps<any>) => {
  if (!__EXPERIMENTAL__.each) {
    throw new Error(
      'Each is experimental and must be enabled with `experimental: ["each"]` in the `qwikVite` plugin.'
    );
  }
  useTaskQrl(/*#__PURE__*/ inlinedQrl(eachCmpTask, '_eaT', [props]));
  return SkipRender;
};

/** @public @experimental */
export const Each = /*#__PURE__*/ componentQrl<EachProps<any>>(
  /*#__PURE__*/ inlinedQrl(eachCmp, '_eaC')
) as EachComponent;
