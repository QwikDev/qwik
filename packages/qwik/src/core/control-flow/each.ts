import type { PublicProps } from '../shared/component.public';
import type { DevJSX, JSXOutput } from '../shared/jsx/types/jsx-node';
import type { QRL } from '../shared/qrl/qrl.public';
import { inlinedQrl } from '../shared/qrl/qrl';
import { tryGetInvokeContext } from '../use/use-core';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { componentQrl } from '../shared/component.public';
import { type TaskCtx, useTaskQrl } from '../use/use-task';
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
export const eachCmpTask = ({ track }: TaskCtx) => {
  const props = _captures![0] as EachProps<any>;
  track(() => props.items);
  const context = tryGetInvokeContext()!;
  const host = context.$hostElement$!;
  const container = context.$container$!;
  markVNodeDirty(container, host, ChoreBits.RECONCILE);
};

/** @internal */
export const eachCmp = (props: EachProps<any>) => {
  useTaskQrl(/*#__PURE__*/ inlinedQrl(eachCmpTask, '_eaT', [props]));
  return SkipRender;
};

/** @public */
export const Each = /*#__PURE__*/ componentQrl<EachProps<any>>(
  /*#__PURE__*/ inlinedQrl(eachCmp, '_eaC')
) as EachComponent;
