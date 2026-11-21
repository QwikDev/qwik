import { isServer } from '@qwik.dev/core/build';
import type { PublicProps } from '../shared/component.public';
import { component$ } from '../shared/component.public';
import { setNodeDiffPayload } from '../shared/cursor/chore-execution';
import type { DevJSX, JSXOutput } from '../shared/jsx/types/jsx-node';
import { SkipRender } from '../shared/jsx/utils.public';
import { isServerPlatform } from '../shared/platform/platform';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { isQrl } from '../shared/qrl/qrl-utils';
import { qTest } from '../shared/utils/qdev';
import { maybeThen } from '../shared/utils/promises';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import type { VNode } from '../shared/vnode/vnode';
import type { SSRContainer } from '../ssr/ssr-types';
import { tryGetInvokeContext, type InvokeContext } from '../use/use-core';
import { useTask$ } from '../use/use-task-dollar';

/** @public @experimental */
export interface ShowProps<
  WHEN = unknown,
  THEN extends JSXOutput = JSXOutput,
  ELSE extends JSXOutput = JSXOutput,
> {
  when$: QRL<() => WHEN>;
  then$: QRL<(when: WHEN) => THEN>;
  else$?: QRL<(when: WHEN) => ELSE>;
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

const invokeShowFn = <T, A>(
  fn: QRL<(arg: A) => T> | ((arg: A) => T),
  context: InvokeContext | undefined,
  arg: A
) => {
  return isQrl(fn) ? (fn as QRLInternal<(arg: A) => T>).getFn(context)(arg) : fn(arg);
};

/** @public @experimental */
export const Show = /*#__PURE__*/ component$<ShowProps<any>>((props) => {
  if (!__EXPERIMENTAL__.show) {
    throw new Error(
      'Show is experimental and must be enabled with `experimental: ["show"]` in the `qwikVite` plugin.'
    );
  }
  useTask$(({ track }) => {
    const context = tryGetInvokeContext()!;
    const host = context.$hostElement$!;
    const container = context.$container$!;
    const isSsr = qTest ? isServerPlatform() : isServer;

    return maybeThen(
      track(() => invokeShowFn(props.when$, tryGetInvokeContext(), undefined as any)),
      (condition) => {
        const branch = condition ? props.then$ : props.else$;
        return maybeThen(branch ? invokeShowFn(branch, context, condition) : null, (output) => {
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
  });
  return SkipRender;
}) as ShowComponent;
