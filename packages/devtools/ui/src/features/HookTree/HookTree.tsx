import { $, component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';
import { Tree } from '../../components/Tree/Tree';
import type { TreeNode } from '../../components/Tree/type';
import {
  getPageDataSource,
  type ComponentDetailEntry,
} from '../../devtools/page-data-source';
import {
  toTreeNodes,
  treeIdFingerprint,
  findNodeById,
  findNodeByDomAttr,
  getElementType,
  resetNodeId,
  nextId,
} from './hookTreeHelpers';
import {
  RenderTreeTabs,
  type RenderTreeTabId,
} from '../RenderTree/components/RenderTreeTabs';
import { StateTreeNodeLabel } from '../RenderTree/components/StateTreeNodeLabel';
import { HookFiltersCard } from '../RenderTree/components/HookFiltersCard';
import type { HookFilterItem, HookType } from '../RenderTree/types';
import { IconButton } from '../../components/IconButton/IconButton';
import { IconTarget, IconExpandShrink } from '../../components/Icons/Icons';
const EXPAND_ANIMATION_DELAY_MS = 250;
const HIGHLIGHT_FLASH_MS = 1500;
const LOAD_RETRY_DELAY_MS = 300;
const PAGE_CHANGE_SETTLE_MS = 500;

function valueToTree(
  key: string,
  val: unknown,
  depth: number,
): TreeNode | null {
  if (depth > 8) {
    return null;
  }

  if (val === null || val === undefined) {
    return { id: nextId(), label: `${key}: ${val}`, elementType: 'null' };
  }

  const t = typeof val;

  if (t === 'boolean' || t === 'number') {
    return {
      id: nextId(),
      label: `${key}: ${val}`,
      elementType: getElementType(val),
    };
  }

  if (t === 'string') {
    return { id: nextId(), label: `${key}: "${val}"`, elementType: 'string' };
  }

  // Function marker from deep serializer
  if (
    t === 'object' &&
    val &&
    (val as Record<string, unknown>).__type === 'function'
  ) {
    const name = (val as Record<string, unknown>).__name || 'anonymous';
    return {
      id: nextId(),
      label: `${key}: ƒ ${name}()`,
      elementType: 'function',
    };
  }

  if (Array.isArray(val)) {
    const children = val
      .map((item, i) => valueToTree(String(i), item, depth + 1))
      .filter((n): n is TreeNode => n !== null);
    return {
      id: nextId(),
      label: `${key}: Array[${val.length}]`,
      elementType: 'array',
      children,
    };
  }

  if (t === 'object' && val) {
    const obj = val as Record<string, unknown>;
    const className = obj.__className as string | undefined;
    const displayKeys = Object.keys(obj).filter(
      (k) => k !== '__className' && k !== '__display' && k !== '__type',
    );

    const children = displayKeys
      .map((k) => valueToTree(k, obj[k], depth + 1))
      .filter((n): n is TreeNode => n !== null);

    const label =
      className && className !== 'Object'
        ? `${key}: Class {${className}}`
        : `${key}: Object {${displayKeys.length}}`;

    return {
      id: nextId(),
      label,
      elementType: 'object',
      children: children.length > 0 ? children : undefined,
    };
  }

  return {
    id: nextId(),
    label: `${key}: ${String(val)}`,
    elementType: 'string',
  };
}

function buildDetailTree(entries: ComponentDetailEntry[]): TreeNode[] {
  resetNodeId();
  const result: TreeNode[] = [];

  // Group by hookType
  const groups = new Map<string, ComponentDetailEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.hookType) ?? [];
    list.push(entry);
    groups.set(entry.hookType, list);
  }

  for (const [hookType, hooks] of groups) {
    const children: TreeNode[] = [];

    for (const hook of hooks) {
      const varName = hook.variableName || hookType;
      const data = hook.data;

      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        const className = obj.__className as string | undefined;
        const displayKeys = Object.keys(obj).filter(
          (k) => k !== '__className' && k !== '__display' && k !== '__type',
        );

        const subChildren = displayKeys
          .map((k) => valueToTree(k, obj[k], 1))
          .filter((n): n is TreeNode => n !== null);

        const sizeLabel =
          className && className !== 'Object'
            ? `Class {${className}}`
            : `Object {${displayKeys.length}}`;

        children.push({
          id: nextId(),
          label: `let ${varName} = : ${sizeLabel}`,
          children: subChildren.length > 0 ? subChildren : undefined,
        });
      } else {
        // Primitive or simple value
        const formatted =
          data === null
            ? 'null'
            : data === undefined
              ? 'undefined'
              : typeof data === 'string'
                ? `"${data}"`
                : String(data);
        children.push({
          id: nextId(),
          label: `let ${varName} = : ${formatted}`,
        });
      }
    }

    result.push({
      id: nextId(),
      label: hookType,
      name: hookType,
      children,
    });
  }

  return result;
}

interface SelectedNode {
  name: string;
  nodeId: string;
  qrlChunk?: string;
}

/** DOM helpers for expand/scroll/highlight */
function expandAndScrollToNode(targetName: string) {
  requestAnimationFrame(() => {
    const container = document.getElementById('hook-tree-left');
    if (!container) {
      return;
    }

    // First, expand all collapsed ancestors by clicking their chevrons
    const rows = Array.from(
      container.querySelectorAll('[class*="cursor-pointer"]'),
    );
    let targetRow: HTMLElement | null = null;

    for (const row of rows) {
      const text = row.textContent || '';
      if (text.includes(`<${targetName}`)) {
        targetRow = row as HTMLElement;
        break;
      }
    }
    if (!targetRow) {
      return;
    }

    // Walk up DOM to find collapsed parent sections and expand them
    let parent = targetRow.parentElement;
    while (parent && parent.id !== 'hook-tree-left') {
      // Check if this is an animated collapse container (maxHeight: 0px)
      if (parent.style.maxHeight === '0px') {
        // Find the sibling row with the chevron and click it to expand
        const siblingRow = parent.previousElementSibling;
        if (siblingRow) {
          (siblingRow as HTMLElement).click();
        }
      }
      parent = parent.parentElement;
    }

    // Wait for expansion animation then scroll and highlight
    setTimeout(() => {
      if (!targetRow) {
        return;
      }
      targetRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
      targetRow.click();
      targetRow.style.background = 'rgba(139, 92, 246, 0.25)';
      targetRow.style.borderRadius = '8px';
      targetRow.style.transition = 'background 0.5s';
      setTimeout(() => {
        if (!targetRow) {
          return;
        }
        targetRow.style.background = '';
        targetRow.style.borderRadius = '';
        targetRow.style.transition = '';
      }, HIGHLIGHT_FLASH_MS);
    }, EXPAND_ANIMATION_DELAY_MS);
  });
}
export const HookTree = component$(() => {
  const treeData = useSignal<TreeNode[]>([]);
  const treeVersion = useSignal(0);
  const lastTreeIds = useSignal('');
  const stateTree = useSignal<TreeNode[]>([]);
  const fullStateTree = useSignal<TreeNode[]>([]);
  const hookFilters = useSignal<HookFilterItem[]>([]);
  const hooksOpen = useSignal(true);
  const currentTab = useSignal<RenderTreeTabId>('state');
  const selectedNode = useSignal<SelectedNode | null>(null);
  const editingNodeId = useSignal<string | null>(null);
  const editValue = useSignal('');
  const inspecting = useSignal(false);

  // Must be a QRL so signal changes trigger Qwik's scheduler
  const handleElementPicked = $(
    (payload: { qId?: string; colonId?: string; treeNodeId?: string }) => {
      inspecting.value = false;

      let found: TreeNode | null = null;
      if (payload.treeNodeId) {
        found = findNodeById(treeData.value, payload.treeNodeId);
      }
      if (!found) {
        found = findNodeByDomAttr(
          treeData.value,
          payload.qId || null,
          payload.colonId || null,
        );
      }
      if (found) {
        onNodeClick(found);

        // DOM-based expand + highlight + scroll
        expandAndScrollToNode(found!.label || found!.name || '');
      }
    },
  );

  const applyFilters = $((tree: TreeNode[], filters: HookFilterItem[]) => {
    if (filters.length === 0) {
      return tree;
    }
    return tree.filter((node) =>
      filters.some((f) => f.key === node.label && f.display),
    );
  });

  // Re-fetch detail for the currently selected component
  const refreshSelectedDetail = $(async () => {
    const sel = selectedNode.value;
    if (!sel) {
      return;
    }
    const source = getPageDataSource();
    const [detail, vnodeProps] = await Promise.all([
      source.readComponentDetail(sel.name, sel.qrlChunk),
      source.readNodeProps(sel.nodeId),
    ]);

    const entries: ComponentDetailEntry[] = detail ?? [];
    if (vnodeProps && Object.keys(vnodeProps).length > 0) {
      entries.push({
        hookType: 'props',
        variableName: 'props',
        data: vnodeProps,
      });
    }

    if (entries.length > 0) {
      const full = buildDetailTree(entries);
      fullStateTree.value = full;
      const existingMap = new Map<string, boolean>(
        hookFilters.value.map((f) => [f.key, f.display]),
      );
      hookFilters.value = full.map((n) => ({
        key: (n.label || n.name || '') as HookType,
        display: existingMap.get(n.label || n.name || '') ?? true,
      }));
      stateTree.value = await applyFilters(full, hookFilters.value);
    }
  });

  useVisibleTask$(({ cleanup }) => {
    const source = getPageDataSource();

    const loadInitial = async (retries = 3) => {
      const vnodeTree = await source.readVNodeTree();
      if (vnodeTree && vnodeTree.length > 0) {
        const fp = treeIdFingerprint(vnodeTree);
        if (fp !== lastTreeIds.value) {
          lastTreeIds.value = fp;
          treeData.value = toTreeNodes(vnodeTree);
        }
      } else if (retries > 0) {
        setTimeout(() => loadInitial(retries - 1), LOAD_RETRY_DELAY_MS);
      }
    };

    loadInitial();

    // Real-time updates via event-driven messaging
    const unsub = source.subscribeTreeUpdates((tree) => {
      const fp = treeIdFingerprint(tree);
      if (fp !== lastTreeIds.value) {
        lastTreeIds.value = fp;
        treeData.value = toTreeNodes(tree);
      }
      refreshSelectedDetail();
    });

    // Listen for PAGE_CHANGED and ELEMENT_PICKED (extension mode only)
    const port = (window as any).__devtools_port;
    let pageCleanup: (() => void) | undefined;
    if (port?.onMessage) {
      const portHandler = (msg: any) => {
        if (msg?.type === 'PAGE_CHANGED') {
          treeData.value = [];
          stateTree.value = [];
          selectedNode.value = null;
          lastTreeIds.value = '';
          treeVersion.value++;
          setTimeout(() => loadInitial(), PAGE_CHANGE_SETTLE_MS);
        }
        if (msg?.type === 'ELEMENT_PICKED' && msg.payload) {
          handleElementPicked(msg.payload);
        }
      };
      port.onMessage.addListener(portHandler);
      pageCleanup = () => port.onMessage.removeListener(portHandler);
    }

    // Hover highlight: when hovering a tree node, highlight the component on the page
    const treeEl = document.getElementById('hook-tree-left');
    let lastHoveredId = '';
    const handleTreeHover = (e: Event) => {
      const target = (e.target as HTMLElement).closest('[data-node-id]');
      if (!target) {
        if (lastHoveredId) {
          source.unhighlightElement();
          lastHoveredId = '';
        }
        return;
      }
      const vnodeId = (target as HTMLElement).dataset.nodeId || '';
      const name = (target as HTMLElement).dataset.nodeName || '';
      if (!vnodeId || vnodeId === lastHoveredId) {
        return;
      }
      lastHoveredId = vnodeId;
      source.highlightElement(vnodeId, name);
    };
    const handleTreeLeave = () => {
      if (lastHoveredId) {
        source.unhighlightElement();
        lastHoveredId = '';
      }
    };
    treeEl?.addEventListener('mouseover', handleTreeHover);
    treeEl?.addEventListener('mouseleave', handleTreeLeave);

    cleanup(() => {
      unsub?.();
      pageCleanup?.();
      treeEl?.removeEventListener('mouseover', handleTreeHover);
      treeEl?.removeEventListener('mouseleave', handleTreeLeave);
    });
  });

  const onNodeClick = $(async (node: TreeNode) => {
    const source = getPageDataSource();
    const name = node.name || node.label || '';
    if (!name) {
      stateTree.value = [];
      selectedNode.value = null;
      return;
    }

    const qrlChunk = (node.props as Record<string, unknown> | undefined)
      ?.__qrlChunk as string | undefined;
    selectedNode.value = { name, nodeId: node.id, qrlChunk };

    // Read hooks from global state AND VNode props
    const [detail, vnodeProps] = await Promise.all([
      source.readComponentDetail(name, qrlChunk),
      source.readNodeProps(node.id),
    ]);

    const entries: ComponentDetailEntry[] = detail ?? [];

    // Add VNode props as a "props" hook type (same as overlay)
    if (vnodeProps && Object.keys(vnodeProps).length > 0) {
      entries.push({
        hookType: 'props',
        variableName: 'props',
        data: vnodeProps,
      });
    }

    if (entries.length > 0) {
      const full = buildDetailTree(entries);
      fullStateTree.value = full;
      hookFilters.value = full.map((n) => ({
        key: (n.label || n.name || '') as HookType,
        display: true,
      }));
      stateTree.value = full;
    } else {
      stateTree.value = [];
      fullStateTree.value = [];
      hookFilters.value = [];
    }
  });

  // Click on a leaf value to start inline editing
  const onStateNodeClick = $(async (node: TreeNode) => {
    // Only allow editing leaf nodes that look like "let varName = : value"
    if (node.children && node.children.length > 0) {
      return;
    }
    const label = node.label || '';
    const match = label.match(/^let (\S+) = : (.+)$/);
    if (!match) {
      return;
    }

    editingNodeId.value = node.id;
    const rawVal = match[2];
    // Strip quotes for string values
    editValue.value =
      rawVal.startsWith('"') && rawVal.endsWith('"')
        ? rawVal.slice(1, -1)
        : rawVal;
  });

  const commitEdit = $(async () => {
    if (!editingNodeId.value || !selectedNode.value) {
      return;
    }

    // Find which variable we're editing from the state tree
    const sel = selectedNode.value;
    const source = getPageDataSource();

    // Walk state tree to find the editing node and its parent hook type
    let variableName = '';
    for (const group of stateTree.value) {
      for (const child of group.children || []) {
        if (child.id === editingNodeId.value) {
          const lbl = child.label || '';
          const m = lbl.match(/^let (\S+) = :/);
          if (m) {
            variableName = m[1];
          }
        }
      }
    }

    if (variableName) {
      // Try to parse as JSON, fallback to string
      let parsed: unknown = editValue.value;
      try {
        parsed = JSON.parse(editValue.value);
      } catch {
        // keep as string
      }

      await source.setSignalValue(sel.name, sel.qrlChunk, variableName, parsed);

      // Refresh to show updated value
      await refreshSelectedDetail();
    }

    editingNodeId.value = null;
  });

  const cancelEdit = $(() => {
    editingNodeId.value = null;
  });

  const handleSelectAll = $(async () => {
    hookFilters.value = hookFilters.value.map((f) => ({ ...f, display: true }));
    stateTree.value = await applyFilters(
      fullStateTree.value,
      hookFilters.value,
    );
  });

  const handleClear = $(async () => {
    hookFilters.value = hookFilters.value.map((f) => ({
      ...f,
      display: false,
    }));
    stateTree.value = await applyFilters(
      fullStateTree.value,
      hookFilters.value,
    );
  });

  const handleFilterChange = $(async (index: number, checked: boolean) => {
    hookFilters.value = hookFilters.value.map((f, i) =>
      i === index ? { ...f, display: checked } : f,
    );
    stateTree.value = await applyFilters(
      fullStateTree.value,
      hookFilters.value,
    );
  });

  const startInspect = $(() => {
    const port = (window as any).__devtools_port;

    if (port) {
      inspecting.value = true;
      port.postMessage({ type: 'START_INSPECT' });
    }
  });

  const stopInspect = $(() => {
    const port = (window as any).__devtools_port;
    if (port) {
      inspecting.value = false;
      port.postMessage({ type: 'STOP_INSPECT' });
    }
  });

  const treeExpanded = useSignal(true);

  const toggleTreeExpand = $(() => {
    const container = document.getElementById('hook-tree-left');
    if (!container) {
      return;
    }
    // Find all chevron buttons (svg inside cursor-pointer rows)
    const chevrons = Array.from(
      container.querySelectorAll('svg[class*="shrink-0"]'),
    );
    for (const chevron of chevrons) {
      const isExpanded = chevron.classList.contains('rotate-180');
      // If we want to expand all, click collapsed ones. If collapse all, click expanded ones.
      if (treeExpanded.value ? isExpanded : !isExpanded) {
        (chevron.closest('[class*="cursor-pointer"]') as HTMLElement)?.click();
      }
    }
    treeExpanded.value = !treeExpanded.value;
  });

  return (
    <div class="border-glass-border bg-card-item-bg h-full w-full flex-1 overflow-hidden rounded-2xl border">
      <div class="flex h-full w-full">
        {/* Component tree (left panel) */}
        <div
          class="custom-scrollbar flex w-1/2 flex-col overflow-hidden p-3"
          style={{ minWidth: '360px' }}
        >
          {/* Toolbar: Pick + Expand/Collapse */}
          <div class="mb-2 flex items-center gap-1">
            <IconButton
              onClick$={inspecting.value ? stopInspect : startInspect}
              active={inspecting.value}
              title="Select a component on the page"
            >
              <IconTarget class="h-3.5 w-3.5" />
              {inspecting.value ? 'Picking...' : 'Pick'}
            </IconButton>
            <IconButton
              onClick$={toggleTreeExpand}
              title={treeExpanded.value ? 'Collapse all' : 'Expand all'}
            >
              <IconExpandShrink
                class="h-3.5 w-3.5"
                expanded={treeExpanded.value}
              />
              {treeExpanded.value ? 'Collapse' : 'Expand'}
            </IconButton>
          </div>

          <div id="hook-tree-left" class="min-h-0 flex-1 overflow-y-auto">
            {treeData.value.length === 0 ? (
              <div class="text-muted-foreground flex h-full items-center justify-center text-sm">
                Waiting for component tree...
              </div>
            ) : (
              <Tree
                key={treeVersion.value}
                data={treeData}
                onNodeClick={onNodeClick}
              />
            )}
          </div>
        </div>

        <div class="border-glass-border border-l" />

        {/* Detail panel (right panel) */}
        <div class="flex h-full min-h-0 w-1/2 flex-col overflow-hidden p-4">
          <RenderTreeTabs
            currentTab={currentTab.value}
            onStateClick$={$(() => (currentTab.value = 'state'))}
            onCodeClick$={$(() => (currentTab.value = 'code'))}
          />

          {currentTab.value === 'state' && (
            <div class="mt-5 flex min-h-0 flex-1 flex-col">
              {hookFilters.value.length > 0 && (
                <HookFiltersCard
                  filters={hookFilters.value}
                  isOpen={hooksOpen.value}
                  onSelectAll$={handleSelectAll}
                  onClear$={handleClear}
                  onToggleOpen$={$(() => (hooksOpen.value = !hooksOpen.value))}
                  onFilterChange$={handleFilterChange}
                />
              )}
              {stateTree.value.length > 0 ? (
                <div class="mt-4 min-h-0 flex-1 overflow-y-auto p-2">
                  <Tree
                    data={stateTree}
                    gap={10}
                    animate
                    animationDuration={200}
                    isHover
                    onNodeClick={onStateNodeClick}
                    renderNode={$((node: TreeNode) => {
                      if (editingNodeId.value === node.id) {
                        return (
                          <form
                            preventdefault:submit
                            onSubmit$={commitEdit}
                            class="inline-flex items-center gap-1"
                          >
                            <input
                              type="text"
                              class="border-primary/50 bg-card-item-hover-bg text-foreground focus:border-primary w-32 rounded border px-1.5 py-0.5 text-xs outline-none"
                              value={editValue.value}
                              onInput$={(_, el) => {
                                editValue.value = el.value;
                              }}
                              onKeyDown$={(e) => {
                                if (e.key === 'Escape') {
                                  cancelEdit();
                                }
                              }}
                              autoFocus
                            />
                            <button
                              type="submit"
                              class="bg-primary/20 text-primary hover:bg-primary/30 rounded px-1.5 py-0.5 text-xs"
                            >
                              ok
                            </button>
                          </form>
                        );
                      }
                      return <StateTreeNodeLabel node={node} />;
                    })}
                  />
                </div>
              ) : (
                <div class="text-muted-foreground flex h-full items-center justify-center text-sm">
                  Select a component to inspect its state
                </div>
              )}
            </div>
          )}

          {currentTab.value === 'code' && (
            <div class="border-glass-border bg-card-item-bg mt-4 flex min-h-0 flex-1 items-center justify-center rounded-xl border p-4">
              <div class="text-center">
                <div class="text-muted-foreground text-sm">
                  <span class="font-medium">Code</span> requires the Qwik
                  DevTools Vite plugin.
                </div>
                <div class="text-muted-foreground/60 mt-2 text-xs">
                  Available in the in-app overlay when running{' '}
                  <code class="bg-card-item-hover-bg rounded px-1.5 py-0.5">
                    pnpm dev
                  </code>{' '}
                  with{' '}
                  <code class="bg-card-item-hover-bg rounded px-1.5 py-0.5">
                    @qwik.dev/devtools
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
