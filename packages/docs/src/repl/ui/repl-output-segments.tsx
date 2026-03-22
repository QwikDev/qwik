import type { TransformModule } from '@qwik.dev/core/optimizer';
import { CodeBlock } from '../../components/code-block/code-block';
import { $, component$, useSignal } from '@qwik.dev/core';
import { ReplOutputSplit } from './repl-output-split';
const FILE_MODULE_DIV_ID = 'file-modules-symbol';

type TransformModuleV2 = TransformModule & {
  segment?: { canonicalFilename: string; paramNames: string[]; captureNames: string[] };
};

export const ReplOutputSymbols = component$(({ outputs }: ReplOutputSymbolsProps) => {
  const selectedPath = useSignal(outputs.length ? outputs[0].path : '');
  const pathInView$ = $((path: string) => {
    selectedPath.value = path;
  });

  const segments = outputs.filter((o) => !!o.segment);

  return (
    <ReplOutputSplit
      rootClass="output-result output-code-theme output-modules"
      left={
        <div class="file-tree output-panel-section">
          <div class="file-tree-header output-panel-section-header">Segments</div>
          <div class="file-tree-body output-panel-section-body">
            <div class="file-tree-items">
              {segments.map((o, i) => (
                <div key={o.path}>
                  <a
                    href="#"
                    onClick$={() => {
                      const fileItem = document.querySelector(`[data-symbol-item="${i}"]`);
                      if (fileItem) {
                        selectedPath.value = o.path;
                        fileItem.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                    class={{ 'in-view': selectedPath.value === o.path }}
                    preventdefault:click
                    title={o.segment?.canonicalFilename}
                  >
                    {o.segment?.canonicalFilename}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      right={
        <div class="file-modules" id={FILE_MODULE_DIV_ID}>
          {(segments as TransformModuleV2[]).map((o, i) => (
            <div class="file-item output-panel-section" data-symbol-item={i} key={o.path}>
              <div class="file-info output-panel-section-header">
                <span>{o.segment?.canonicalFilename}</span>
                {o.segment!.paramNames && (
                  <div class="file-meta">
                    Params: <code>{o.segment!.paramNames.join(', ')}</code>
                  </div>
                )}
                {o.segment!.captureNames && (
                  <div class="file-meta">
                    Captures: <code>{o.segment!.captureNames.join(', ')}</code>
                  </div>
                )}
              </div>
              <div class="file-text output-panel-section-body">
                <CodeBlock
                  pathInView$={pathInView$}
                  path={o.path}
                  code={o.code}
                  observerRootId={FILE_MODULE_DIV_ID}
                />
              </div>
            </div>
          ))}
        </div>
      }
    />
  );
});

interface ReplOutputSymbolsProps {
  outputs: TransformModule[];
}
