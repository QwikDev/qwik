import {
  $,
  component$,
  type QRL,
  type ReadonlySignal,
  type Signal,
  useSignal,
  useVisibleTask$,
} from '@qwik.dev/core';
import type { JSXOutput } from '@qwik.dev/core';
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
  /** Name of a node to reveal: expands its ancestors, selects it, and scrolls it into view. */
  revealNode?: ReadonlySignal<string | null>;
  /** Called once a reveal has been handled, so the caller can clear its request. */
  onRevealed$?: QRL<() => void>;
}

interface TreeNodeComponentProps {
  node: TreeNode;
  level: number;
  gap: number;
  isHover: boolean;
  activeNodeId: string;
  expandLevel: number;
  /** Per-node override of children visibility; absent means the expandLevel default applies. */
  expanded: Record<string, boolean>;
  onToggle: QRL<(id: string, childrenVisible: boolean) => void>;
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
 * Build a compact attribute string from a node's props. Only displays the keys listed in
 * `DISPLAY_PROPS`.
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

/** Collects the ids from the root down to the first node whose name or label matches. */
function findIdPathByName(nodes: TreeNode[], name: string): string[] | null {
  for (const node of nodes) {
    if (node.name === name || node.label === name) {
      return [node.id];
    }
    const childPath = node.children?.length ? findIdPathByName(node.children, name) : null;
    if (childPath) {
      return [node.id, ...childPath];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// TreeNodeComponent
// ---------------------------------------------------------------------------

const TreeNodeComponent = component$<TreeNodeComponentProps>((props) => {
  const hasChildren = (props.node.children?.length ?? 0) > 0;
  const override = props.expanded[props.node.id];
  const childrenVisible = override !== undefined ? override : props.level < props.expandLevel;

  const handleNodeClick = $(() => {
    props.onNodeClick(props.node);
    if (hasChildren) {
      props.onToggle(props.node.id, childrenVisible);
    }
  });

  const isActive = props.isHover && props.node.id === props.activeNodeId;
  const duration = props.animationDuration ?? 200;
  const showChildren = hasChildren && childrenVisible;

  const renderChildren = props.node.children?.map((child) => (
    <TreeNodeComponent
      isHover={props.isHover}
      key={child.id}
      node={child}
      gap={props.gap}
      expandLevel={props.expandLevel}
      level={props.level + 1}
      activeNodeId={props.activeNodeId}
      expanded={props.expanded}
      onToggle={props.onToggle}
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
          isActive ? 'bg-primary/10 text-primary' : 'hover:bg-card-item-hover-bg',
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
                childrenVisible ? 'rotate-180' : 'rotate-90'
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
                <span class="text-primary/80">{props.node.label || props.node.name}</span>
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
              maxHeight: showChildren ? '1000px' : '0px',
              opacity: showChildren ? '1' : '0',
              transition: `max-height ${duration}ms ease-in-out, opacity ${duration}ms ease-in-out`,
            }}
          >
            {renderChildren}
          </div>
        ) : (
          showChildren && <>{renderChildren}</>
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
  // Per-node children-visibility overrides. A new object identity on each change so the drilled
  // prop propagates reactively to every node.
  const expanded = useSignal<Record<string, boolean>>({});

  const setActiveNode = $((node: TreeNode) => {
    if (ref.value) {
      ref.value.scrollLeft = ref.value.scrollWidth;
    }
    activeNodeId.value = node.id;
    props.onNodeClick?.(node);
  });

  const toggleNode = $((id: string, childrenVisible: boolean) => {
    expanded.value = { ...expanded.value, [id]: !childrenVisible };
  });

  // Signal-driven reveal: expand the target's ancestors, select it, and scroll to it. Retries when
  // the data arrives, since the tree loads asynchronously.
  useVisibleTask$(({ track }) => {
    const name = track(() => props.revealNode?.value);
    const nodes = track(() => props.data.value);
    if (!name) {
      return;
    }
    const path = findIdPathByName(nodes, name);
    if (!path) {
      return;
    }
    // Expand the whole path, including the target, so its own children are visible too.
    const nextExpanded = { ...expanded.value };
    for (const id of path) {
      nextExpanded[id] = true;
    }
    expanded.value = nextExpanded;
    const targetId = path[path.length - 1];
    activeNodeId.value = targetId;

    const container = ref.value;
    if (container) {
      // Wait for the expansion animation to settle before scrolling to the final position.
      const scrollDelay = (props.animate ?? true) ? (props.animationDuration ?? 200) + 50 : 0;
      setTimeout(() => {
        container
          .querySelector(`[data-node-id="${targetId}"]`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, scrollDelay);
    }
    props.onRevealed$?.();
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
          expanded={expanded.value}
          onToggle={toggleNode}
          onNodeClick={setActiveNode}
          renderNode={props.renderNode}
          animate={props.animate ?? true}
          animationDuration={props.animationDuration}
        />
      ))}
    </div>
  );
});
