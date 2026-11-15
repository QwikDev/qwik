import { $, component$, useSignal, useStore } from '@qwik.dev/core';
import { lucide } from '@qds.dev/ui';
import { CodeBlock } from '../../components/code-block/code-block';
import type { ReplModuleOutput } from '../types';
import { ReplOutputSplit } from './repl-output-split';
const FILE_MODULE_DIV_ID = 'file-modules-client-modules';

export const ReplOutputModules = component$(({ outputs, headerText }: ReplOutputModulesProps) => {
  const selectedPath = useSignal(outputs.length ? outputs[0].path : '');
  // Keyed by path: a rebuild replaces the output objects.
  const expandedPaths = useStore<Record<string, boolean>>({});
  const pathInView$ = $((path: string) => {
    selectedPath.value = path;
  });
  return (
    <ReplOutputSplit
      rootClass="output-result output-code-theme output-modules"
      left={
        <div class="file-tree output-panel-section">
          <div class="file-tree-header output-panel-section-header">
            {outputs.length > 0 ? headerText : ''}
          </div>
          <div class="file-tree-body output-panel-section-body">
            <div class="file-tree-items">
              {outputs.map((o, i) => (
                <div key={o.path}>
                  <a
                    href="#"
                    onClick$={() => {
                      const fileItem = document.querySelector(`[data-output-item="${i}"]`);
                      if (fileItem) {
                        fileItem.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    class={{ 'in-view': selectedPath.value === o.path }}
                    preventdefault:click
                    key={o.path}
                    title={o.path}
                  >
                    {o.path}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      right={
        <div class="file-modules" id={FILE_MODULE_DIV_ID}>
          {outputs.map((o, i) => {
            const isLarge = o.code.length > 3000;
            const isExpanded = !!expandedPaths[o.path];
            const code = isLarge && !isExpanded ? o.code.slice(0, 3000) : o.code;
            return (
              <div class="file-item output-panel-section" data-output-item={i} key={o.path}>
                <div class="file-info output-panel-section-header">
                  <span>{o.path}</span>
                  {o.size ? <span class="file-size">({o.size})</span> : null}
                </div>
                <div class="file-text output-panel-section-body">
                  <CodeBlock
                    pathInView$={pathInView$}
                    path={o.path}
                    code={code}
                    observerRootId={FILE_MODULE_DIV_ID}
                  />
                  {isLarge && (
                    <button
                      type="button"
                      class="file-toggle-button"
                      onClick$={() => (expandedPaths[o.path] = !expandedPaths[o.path])}
                      aria-expanded={isExpanded}
                    >
                      <span>{isExpanded ? 'Show less' : 'Truncated - show more'}</span>
                      <span
                        class={{
                          'file-toggle-button-icon ml-3': true,
                          'rotate-180': isExpanded,
                        }}
                        aria-hidden="true"
                      >
                        <lucide.chevrondown class="size-4" />
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      }
    />
  );
});

interface ReplOutputModulesProps {
  headerText: string;
  outputs: ReplModuleOutput[];
}
