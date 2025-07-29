import { $, component$, useSignal } from '@qwik.dev/core';
import type { TransformModule } from '@qwik.dev/core/optimizer';
import { CodeBlock } from '../components/code-block/code-block';
const FILE_MODULE_DIV_ID = 'file-modules-symbol';

export const ReplOutputSegments = component$(({ outputs }: ReplOutputSegmentsProps) => {
  const selectedPath = useSignal(outputs.length ? outputs[0].path : '');
  const pathInView$ = $((path: string) => {
    selectedPath.value = path;
  });

  return (
    <div class="output-result output-modules">
      <div class="file-tree">
        <div class="file-tree-header">Segments</div>
        <div class="file-tree-items">
          {outputs.map((o, i) => (
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
      <div class="file-modules" id={FILE_MODULE_DIV_ID}>
        {outputs
          .filter((o) => !!o.segment)
          .map((o, i) => (
            <div class="file-item" data-symbol-item={i} key={o.path}>
              <div class="file-info">
                <span>{o.segment!.canonicalFilename}</span>
                {o.segment!.paramNames && (
                  <div>
                    Params: <code>{o.segment!.paramNames.join(', ')}</code>
                  </div>
                )}
                {o.segment!.captureNames && (
                  <div>
                    Captures: <code>{o.segment!.captureNames.join(', ')}</code>
                  </div>
                )}
              </div>
              <div class="file-text">
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
    </div>
  );
});

interface ReplOutputSegmentsProps {
  outputs: TransformModule[];
}
