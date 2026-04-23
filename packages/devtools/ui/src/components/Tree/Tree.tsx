import { $, component$, type QRL, useSignal } from '@qwik.dev/core';
import type { JSXOutput, Signal } from '@qwik.dev/core';
import { IconChevronUpMini } from '../Icons/Icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { TreeNode, TreeNodePropValue } from './type';

export interface TreeProps {
  data: Signal<TreeNode[]>;
  onNodeClick?: QRL<(node: TreeNode) => void>;
  renderNode?: QRL<(node: TreeNode) => JSXOutput>;
  gap?: number;
  isHover?: boolean;
  animate?: boolean;
  animationDuration?: number;
  expandLevel?: number;
}

interface TreeNodeComponentProps {
  node: TreeNode;
  level: number;
  gap: number;
  isHover: boolean;
  activeNodeId: string;
  expandLevel: number;
  onNodeClick: QRL<(node: TreeNode) => void>;
  renderNode?: QRL<(node: TreeNode) => JSXOutput>;
  animate?: boolean;
  animationDuration?: number;
}

// ---------------------------------------------------------------------------
// Helpers (pure, framework-agnostic)
// ---------------------------------------------------------------------------

/** Prop keys that should be rendered next to the element name in the tree. */
const DISPLAY_PROPS = ['q:id', 'q:key'] as const;

/**
 * Build a compact attribute string from a node's props.
 * Only displays the keys listed in `DISPLAY_PROPS`.
 */
function formatDisplayProps(props: Record<string, TreeNodePropValue>): string {
  let result = '';
  for (const key of DISPLAY_PROPS) {
    const value = props[key];
    if (value != null) {
      result += `${key}="${String(value)}" `;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// TreeNodeComponent
// ---------------------------------------------------------------------------

const TreeNodeComponent = component$<TreeNodeComponentProps>((props) => {
  const isExpanded = useSignal(props.expandLevel <= props.level);
  const hasChildren = (props.node.children?.length ?? 0) > 0;

  const handleNodeClick = $(() => {
    props.onNodeClick(props.node);
    if (hasChildren) {
      isExpanded.value = !isExpanded.value;
    }
  });

  const isActive = props.isHover && props.node.id === props.activeNodeId;
  const duration = props.animationDuration ?? 200;
  const shouldShowChildren = hasChildren && !isExpanded.value;

  const renderChildren = props.node.children?.map((child) => (
    <TreeNodeComponent
      isHover={props.isHover}
      key={child.id}
      node={child}
      gap={props.gap}
      expandLevel={props.expandLevel}
      level={props.level + 1}
      activeNodeId={props.activeNodeId}
      onNodeClick={props.onNodeClick}
      renderNode={props.renderNode}
      animate={props.animate}
      animationDuration={props.animationDuration}
    />
  ));

  return (
    <div class="w-full">
      <div
        class={[
          'flex w-full cursor-pointer items-center rounded-lg px-1 py-0.5 transition-colors duration-150',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-card-item-hover-bg',
        ]}
        style={
          isActive
            ? {
                boxShadow: 'inset 2px 0 0 0 var(--color-primary)',
                paddingLeft: `${props.level * props.gap}px`,
              }
            : { paddingLeft: `${props.level * props.gap}px` }
        }
        data-node-id={props.node.id}
        data-node-name={props.node.name || props.node.label || ''}
        onClick$={handleNodeClick}
      >
        <div class="inline-flex items-center px-2 py-1">
          {hasChildren ? (
            <IconChevronUpMini
              class={`text-muted-foreground mr-2 h-4 w-4 shrink-0 transition-transform duration-200 ${
                isExpanded.value ? 'rotate-90' : 'rotate-180'
              }`}
            />
          ) : (
            <div class="mr-2 w-4 shrink-0" />
          )}
          <div class="cursor-pointer font-mono text-sm whitespace-nowrap">
            {props.renderNode ? (
              <>{props.renderNode(props.node)}</>
            ) : (
              <>
                <span class="text-foreground/50">&lt;</span>
                <span class="text-primary/80">
                  {props.node.label || props.node.name}
                </span>
                <span class="text-muted-foreground">
                  {` ${formatDisplayProps(props.node.props ?? {})}`}&gt;
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {hasChildren &&
        (props.animate ? (
          <div
            class="overflow-hidden"
            style={{
              maxHeight: shouldShowChildren ? '1000px' : '0px',
              opacity: shouldShowChildren ? '1' : '0',
              transition: `max-height ${duration}ms ease-in-out, opacity ${duration}ms ease-in-out`,
            }}
          >
            {renderChildren}
          </div>
        ) : (
          shouldShowChildren && <>{renderChildren}</>
        ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Tree (public root component)
// ---------------------------------------------------------------------------

export const Tree = component$<TreeProps>((props) => {
  const ref = useSignal<HTMLElement | undefined>();
  const activeNodeId = useSignal('');

  const setActiveNode = $((node: TreeNode) => {
    if (ref.value) {
      ref.value.scrollLeft = ref.value.scrollWidth;
    }
    activeNodeId.value = node.id;
    props.onNodeClick?.(node);
  });

  return (
    <div class="h-full w-full overflow-x-auto overflow-y-auto" ref={ref}>
      {props.data.value.map((rootNode) => (
        <TreeNodeComponent
          isHover={props.isHover !== false}
          gap={props.gap ?? 20}
          key={rootNode.id}
          node={rootNode}
          level={0}
          expandLevel={props.expandLevel ?? 2}
          activeNodeId={activeNodeId.value}
          onNodeClick={setActiveNode}
          renderNode={props.renderNode}
          animate={props.animate ?? true}
          animationDuration={props.animationDuration}
        />
      ))}
    </div>
  );
});
