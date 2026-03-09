import type { QRLInternal } from '../../server/qwik-types';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
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

export interface EachProps<T> {
  items: T[];
  item$: QRLInternal<(item: T) => JSXOutput>;
  key$: QRLInternal<(item: T, index: number) => string>;
}

/** @internal */
export const _Each_component_useTask_1IvuA9ZneGc = async ({ track }: TaskCtx) => {
  const props = _captures![0] as EachProps<any>;
  track(() => props.items);
  const context = tryGetInvokeContext()!;
  const host = context.$hostElement$!;
  const container = context.$container$!;
  markVNodeDirty(container, host, ChoreBits.RECONCILE);
  const isSsr = import.meta.env.TEST ? isServerPlatform() : isServer;
  if (isSsr) {
    await container.$renderPromise$;
  }
};

/** @internal */
export const _Each_component_zi6m0DQBsr8 = (props: EachProps<any>) => {
  useTaskQrl(
    /*#__PURE__*/ inlinedQrl(
      _Each_component_useTask_1IvuA9ZneGc,
      'Each_component_useTask_1IvuA9ZneGc',
      [props]
    )
  );
  return SkipRender;
};

/** @public */
export const Each = /*#__PURE__*/ componentQrl<EachProps<any>>(
  /*#__PURE__*/ inlinedQrl(_Each_component_zi6m0DQBsr8, 'Each_component_zi6m0DQBsr8')
);
