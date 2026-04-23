import {
  $,
  Resource,
  component$,
  useComputed$,
  useResource$,
  useSignal,
  useStyles$,
  useVisibleTask$,
} from '@qwik.dev/core';
import { Tree } from '../../components/Tree/Tree';
import type { TreeNode } from '../../components/Tree/type';
import { vnode_toObject } from '../../components/Tree/filterVnode';
import { htmlContainer } from '../../utils/location';
import { ISDEVTOOL } from '../../components/Tree/type';
import { removeNodeFromTree } from '../../components/Tree/vnode';
import { isListen } from '../../utils/type';
import debug from 'debug';
import { getHookStore, QrlUtils, type HookType } from './formatTreeData';
import type {
  CodeModule,
  HookFilterItem,
  ParsedHookEntry,
  QRLInternal,
} from './types';
import { unwrapStore } from '@qwik.dev/core/internal';
import {
  getViteClientRpc,
  ParsedStructure,
  QPROPS,
  QRENDERFN,
  QSEQ,
} from '@devtools/kit';
import { getHighlighter } from '../../utils/shiki';
import { getQwikState, returnQrlData } from './data';
import { HighlightedCodeList } from './components/HighlightedCodeList';
import { HookFiltersCard } from './components/HookFiltersCard';
import {
  RenderTreeTabs,
  type RenderTreeTabId,
} from './components/RenderTreeTabs';
import { StateTreeNodeLabel } from './components/StateTreeNodeLabel';
import { filterHookTree } from './utils/filterHookTree';
import { getCodeLanguage } from './utils/getCodeLanguage';

const log = debug('qwik:devtools:renderTree');

function buildVisibleHookTree(
  hookStore: ReturnType<typeof getHookStore>,
  hookFilters: HookFilterItem[],
) {
  return filterHookTree(hookStore.buildTree(), hookFilters);
}

export const RenderTree = component$(() => {
  const hookStore = useSignal(getHookStore());
  useStyles$(`
    pre.shiki {
      overflow: auto;
      padding: 10px;
    }
  `);
  const codes = useSignal<CodeModule[]>([]);
  const data = useSignal<TreeNode[]>([]);

  const stateTree = useSignal<TreeNode[]>([]);
  const hookFilters = useSignal<{ key: HookType; display: boolean }[]>([]);
  const hooksOpen = useSignal(true);

  const qwikContainer = useComputed$(() => {
    try {
      return htmlContainer();
    } catch (error) {
      log('get html container failed: %O', error);
      return null;
    }
  });

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

  useVisibleTask$(() => {
    data.value = removeNodeFromTree(
      vnode_toObject(qwikContainer.value!.rootVNode)!,
      (node) => {
        return node.name === ISDEVTOOL;
      },
    );
  });

  const onNodeClick = $(async (node: TreeNode) => {
    log(' current node clicked: %O', node);
    const rpc = getViteClientRpc();
    let parsed: ParsedStructure[] = [];

    // reset previous collected hook data before new node aggregation
    hookStore.value.clear();

    if (node.props?.[QRENDERFN]) {
      hookStore.value.add('render', {
        data: { render: node.props[QRENDERFN] },
      });
      const qrl = QrlUtils.getChunkName(node.props[QRENDERFN] as QRLInternal);
      parsed = getQwikState(qrl);
    }

    if (Array.isArray(node.props?.[QSEQ]) && parsed.length > 0) {
      const normalizedData = [...parsed, ...returnQrlData(node.props?.[QSEQ])];
      normalizedData.forEach((item) => {
        hookStore.value.add(item.hookType as HookType, item as ParsedHookEntry);
      });
    }

    if (node.props?.[QPROPS]) {
      const props = unwrapStore(node.props[QPROPS]);
      Object.entries(props).forEach(([key, value]) => {
        hookStore.value.add(isListen(key) ? 'listens' : 'props', {
          data: { [key]: value },
        });
      });
    }

    codes.value = [];

    const res =
      (await rpc?.getModulesByPathIds(hookStore.value.findAllQrlPaths())) ?? [];
    log('getModulesByPathIds return: %O', res);
    codes.value = res.filter((item: CodeModule) => item.modules);
    stateTree.value = hookStore.value.buildTree();
    hookFilters.value = hookStore.value.getFilterList();
  });

  const currentTab = useSignal<RenderTreeTabId>('state');

  const showStateTab = $(() => {
    currentTab.value = 'state';
  });

  const showCodeTab = $(() => {
    currentTab.value = 'code';
  });

  const applyHookFilters = $(() => {
    stateTree.value = buildVisibleHookTree(hookStore.value, hookFilters.value);
  });

  const handleSelectAll = $(() => {
    hookFilters.value = hookFilters.value.map((item) => ({
      ...item,
      display: true,
    }));
    applyHookFilters();
  });

  const handleClear = $(() => {
    hookFilters.value = hookFilters.value.map((item) => ({
      ...item,
      display: false,
    }));
    applyHookFilters();
  });

  const handleFilterChange = $((index: number, checked: boolean) => {
    hookFilters.value = hookFilters.value.map((item, itemIndex) =>
      itemIndex === index ? { ...item, display: checked } : item,
    );
    applyHookFilters();
  });

  return (
    <div class="border-glass-border bg-card-item-bg h-full w-full flex-1 overflow-hidden rounded-2xl border">
      <div class="flex h-full w-full">
        <div
          class="custom-scrollbar w-1/2 overflow-hidden p-3"
          style={{ minWidth: '360px' }}
        >
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
                  <div class="text-muted-foreground p-2 text-sm">
                    Loading code highlights…
                  </div>
                )}
                onResolved={(highlighted) => (
                  <HighlightedCodeList
                    codes={codes.value}
                    highlighted={highlighted}
                  />
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
