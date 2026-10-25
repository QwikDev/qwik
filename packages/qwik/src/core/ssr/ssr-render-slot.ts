import { isDev } from '@qwik.dev/core/build';
import { DEBUG_TYPE, VirtualType } from '../shared/types';
import type { JSXNodeInternal, JSXOutput } from '../shared/jsx/types/jsx-node';
import { QDefaultSlot, QSlot, QSlotParent } from '../shared/utils/markers';
import { resolveSlotName } from '../shared/utils/prop';
import type { SSRContainer, SSRRenderJSXOptions } from './ssr-types';

export function openSlotProjection(
  ssr: SSRContainer,
  jsx: JSXNodeInternal,
  options: SSRRenderJSXOptions
): { children: JSXOutput; options: SSRRenderJSXOptions } {
  const componentFrame = options.parentComponentFrame!;
  const slotName = resolveSlotName(componentFrame.componentNode, jsx, ssr);
  ssr.openProjection(
    isDev ? { [DEBUG_TYPE]: VirtualType.Projection, [QSlot]: slotName } : { [QSlot]: slotName }
  );
  const node = ssr.getOrCreateLastNode();
  const defaultChildren = jsx.children ?? null;
  const projectedChildren = componentFrame.consumeChildrenForSlot(node, slotName);
  const children = projectedChildren ?? defaultChildren;
  if (projectedChildren == null) {
    node.removeProp(QSlotParent);
  }
  if (defaultChildren && children !== defaultChildren) {
    ssr.addUnclaimedProjection(componentFrame, QDefaultSlot, defaultChildren);
  }
  return {
    children: children as JSXOutput,
    options:
      projectedChildren == null
        ? { ...options }
        : {
            currentStyleScoped: componentFrame.projectionScopedStyle,
            parentComponentFrame: componentFrame.projectionComponentFrame,
          },
  };
}
