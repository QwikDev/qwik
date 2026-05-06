import {
  $,
  Resource,
  component$,
  useResource$,
  useSignal,
  useStyles$,
  useVisibleTask$,
} from '@qwik.dev/core';
import { Tree } from '../../components/Tree/Tree';
import type { TreeNode } from '../../components/Tree/type';
import debug from 'debug';
import type { CodeModule, HookFilterItem, HookType } from './types';
import { getViteClientRpc } from '@qwik.dev/devtools/kit';
import { getHighlighter } from '../../utils/shiki';
import { HighlightedCodeList } from './components/HighlightedCodeList';
import { HookFiltersCard } from './components/HookFiltersCard';
import { RenderTreeTabs, type RenderTreeTabId } from './components/RenderTreeTabs';
import { StateTreeNodeLabel } from './components/StateTreeNodeLabel';
import { getCodeLanguage } from './utils/getCodeLanguage';
import { getPageDataSource, type ComponentDetailEntry } from '../../devtools/page-data-source';
import { buildDetailTree, toTreeNodes, treeIdFingerprint } from '../HookTree/hookTreeHelpers';

const log = debug('qwik:devtools:renderTree');

const LOAD_RETRY_DELAY_MS = 300;

function applyHookFilters(tree: TreeNode[], filters: HookFilterItem[]) {
  if (filters.length === 0) {
    return tree;
  }
  return tree.filter((node) =>
    filters.some((filter) => filter.key === (node.label || node.name) && filter.display)
  );
}

export const RenderTree = component$(() => {
  useStyles$(`
    pre.shiki {
      overflow: auto;
      padding: 10px;
    }
  `);
  const codes = useSignal<CodeModule[]>([]);
  const data = useSignal<TreeNode[]>([]);
  const lastTreeIds = useSignal('');

  const stateTree = useSignal<TreeNode[]>([]);
  const fullStateTree = useSignal<TreeNode[]>([]);
  const hookFilters = useSignal<HookFilterItem[]>([]);
  const hooksOpen = useSignal(true);

  const highlightedCodesResource = useResource$(async ({ track }) => {
    track(() => codes.value);
    if (!codes.value.length) {
      return [] as string[];
    }
    const highlighter = await getHighlighter();
    return codes.value.map((item) => {
      return item?.modules?.code
        ? highlighter.codeToHtml(item.modules.code, {
            lang: getCodeLanguage(item.pathId),
            theme: 'nord',
          })
        : '';
    });
  });

  useVisibleTask$(({ cleanup }) => {
    const source = getPageDataSource();

    const syncTree = (tree: Awaited<ReturnType<typeof source.readVNodeTree>>) => {
      if (!tree || tree.length === 0) {
        return false;
      }
      const fp = treeIdFingerprint(tree);
      if (fp !== lastTreeIds.value) {
        lastTreeIds.value = fp;
        data.value = toTreeNodes(tree);
      }
      return true;
    };

    const loadInitial = async (retries = 3) => {
      const tree = await source.readVNodeTree();
      if (!syncTree(tree) && retries > 0) {
        window.setTimeout(() => loadInitial(retries - 1), LOAD_RETRY_DELAY_MS);
      }
    };

    loadInitial();

    const unsub = source.subscribeTreeUpdates((tree) => {
      syncTree(tree);
    });

    cleanup(() => {
      unsub?.();
    });
  });

  const onNodeClick = $(async (node: TreeNode) => {
    log(' current node clicked: %O', node);
    const source = getPageDataSource();
    const name = node.name || node.label || '';
    const props = node.props as Record<string, unknown> | undefined;
    const qrlChunk = props?.__qrlChunk as string | undefined;
    const qrlPath = props?.__qrlPath as string | undefined;

    if (!name) {
      codes.value = [];
      fullStateTree.value = [];
      stateTree.value = [];
      hookFilters.value = [];
      return;
    }

    const [detail, vnodeProps] = await Promise.all([
      source.readComponentDetail(name, qrlChunk),
      source.readNodeProps(node.id),
    ]);

    const entries: ComponentDetailEntry[] = detail ? [...detail] : [];
    if (vnodeProps && Object.keys(vnodeProps).length > 0) {
      entries.push({
        hookType: 'props',
        variableName: 'props',
        data: vnodeProps,
      });
    }

    const full = buildDetailTree(entries);
    fullStateTree.value = full;
    hookFilters.value = full.map((item) => ({
      key: (item.label || item.name || '') as HookType,
      display: true,
    }));
    stateTree.value = full;

    codes.value = [];
    if (qrlPath) {
      const rpc = getViteClientRpc();
      const res = (await rpc?.getModulesByPathIds([qrlPath])) ?? [];
      log('getModulesByPathIds return: %O', res);
      codes.value = res.filter((item: CodeModule) => item.modules);
    }
  });

  const currentTab = useSignal<RenderTreeTabId>('state');

  const showStateTab = $(() => {
    currentTab.value = 'state';
  });

  const showCodeTab = $(() => {
    currentTab.value = 'code';
  });

  const refreshFilteredStateTree = $(() => {
    stateTree.value = applyHookFilters(fullStateTree.value, hookFilters.value);
  });

  const handleSelectAll = $(() => {
    hookFilters.value = hookFilters.value.map((item) => ({
      ...item,
      display: true,
    }));
    refreshFilteredStateTree();
  });

  const handleClear = $(() => {
    hookFilters.value = hookFilters.value.map((item) => ({
      ...item,
      display: false,
    }));
    refreshFilteredStateTree();
  });

  const handleFilterChange = $((index: number, checked: boolean) => {
    hookFilters.value = hookFilters.value.map((item, itemIndex) =>
      itemIndex === index ? { ...item, display: checked } : item
    );
    refreshFilteredStateTree();
  });

  return (
    <div class="border-glass-border bg-card-item-bg h-full w-full flex-1 overflow-hidden rounded-2xl border">
      <div class="flex h-full w-full">
        <div class="custom-scrollbar w-1/2 overflow-hidden p-3" style={{ minWidth: '360px' }}>
          <Tree data={data} onNodeClick={onNodeClick}></Tree>
        </div>
        <div class="border-glass-border border-l"></div>
        <div class="flex h-full min-h-0 w-1/2 flex-col overflow-hidden p-4">
          <RenderTreeTabs
            currentTab={currentTab.value}
            onStateClick$={showStateTab}
            onCodeClick$={showCodeTab}
          />

          {currentTab.value === 'state' && (
            <div class="mt-5 flex min-h-0 flex-1 flex-col">
              <HookFiltersCard
                filters={hookFilters.value}
                isOpen={hooksOpen.value}
                onSelectAll$={handleSelectAll}
                onClear$={handleClear}
                onToggleOpen$={$(() => (hooksOpen.value = !hooksOpen.value))}
                onFilterChange$={handleFilterChange}
              />
              <div class="mt-4 min-h-0 flex-1 overflow-y-auto p-2">
                <Tree
                  data={stateTree}
                  gap={10}
                  animate
                  animationDuration={200}
                  isHover
                  renderNode={$((node: TreeNode) => {
                    return <StateTreeNodeLabel node={node} />;
                  })}
                ></Tree>
              </div>
            </div>
          )}

          {currentTab.value === 'code' && (
            <div class="border-glass-border bg-card-item-bg mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border p-2">
              <Resource
                value={highlightedCodesResource}
                onPending={() => (
                  <div class="text-muted-foreground p-2 text-sm">Loading code highlights…</div>
                )}
                onResolved={(highlighted) => (
                  <HighlightedCodeList codes={codes.value} highlighted={highlighted} />
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
