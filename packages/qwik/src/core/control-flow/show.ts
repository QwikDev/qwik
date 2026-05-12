import { isServer } from '@qwik.dev/core/build';
import type { PublicProps } from '../shared/component.public';
import { componentQrl } from '../shared/component.public';
import { setNodeDiffPayload } from '../shared/cursor/chore-execution';
import type { DevJSX, JSXOutput } from '../shared/jsx/types/jsx-node';
import { SkipRender } from '../shared/jsx/utils.public';
import { isServerPlatform } from '../shared/platform/platform';
import { inlinedQrl } from '../shared/qrl/qrl';
import { _captures, type QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { isQrl } from '../shared/qrl/qrl-utils';
import { qTest } from '../shared/utils/qdev';
import { maybeThen } from '../shared/utils/promises';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import type { VNode } from '../shared/vnode/vnode';
import type { SSRContainer } from '../ssr/ssr-types';
import { tryGetInvokeContext, type InvokeContext } from '../use/use-core';
import { type TaskCtx, useTaskQrl } from '../use/use-task';

/** @public @experimental */
export interface ShowProps<
  WHEN = unknown,
  THEN extends JSXOutput = JSXOutput,
  ELSE extends JSXOutput = JSXOutput,
> {
  when$: QRL<() => WHEN>;
  then$: QRL<() => THEN>;
  else$?: QRL<() => ELSE>;
}

/** @public @experimental */
export type ShowComponent = <
  WHEN = unknown,
  THEN extends JSXOutput = JSXOutput,
  ELSE extends JSXOutput = JSXOutput,
>(
  props: PublicProps<ShowProps<WHEN, THEN, ELSE>>,
  key: string | null,
  flags: number,
  dev?: DevJSX
) => JSXOutput;

const invokeShowFn = <T>(fn: QRL<() => T> | (() => T), context: InvokeContext | undefined) => {
  return isQrl(fn) ? (fn as QRLInternal<() => T>).getFn(context)() : fn();
};

/** @internal */
export const showCmpTask = ({ track }: TaskCtx) => {
  const props = _captures![0] as ShowProps<any>;
  const context = tryGetInvokeContext()!;
  const host = context.$hostElement$!;
  const container = context.$container$!;
  const isSsr = qTest ? isServerPlatform() : isServer;

  return maybeThen(
    track(() => invokeShowFn(props.when$, tryGetInvokeContext())),
    (condition) => {
      const branch = condition ? props.then$ : props.else$;
      return maybeThen(branch ? invokeShowFn(branch, context) : null, (output) => {
        const jsx = branch ? [output] : [];
        if (isSsr) {
          const ssr = container as SSRContainer;
          return ssr.renderJSX(jsx, {
            currentStyleScoped: null,
            parentComponentFrame: ssr.getComponentFrame(0),
          });
        } else {
          setNodeDiffPayload(host as VNode, jsx);
          markVNodeDirty(container, host, ChoreBits.NODE_DIFF);
        }
      });
    }
  );
};

/** @internal */
export const showCmp = (props: ShowProps<any>) => {
  if (!__EXPERIMENTAL__.show) {
    throw new Error(
      'Show is experimental and must be enabled with `experimental: ["show"]` in the `qwikVite` plugin.'
    );
  }
  useTaskQrl(/*#__PURE__*/ inlinedQrl(showCmpTask, '_shT', [props]));
  return SkipRender;
};

/** @public @experimental */
export const Show = /*#__PURE__*/ componentQrl<ShowProps<any>>(
  /*#__PURE__*/ inlinedQrl(showCmp, '_shC')
) as ShowComponent;
