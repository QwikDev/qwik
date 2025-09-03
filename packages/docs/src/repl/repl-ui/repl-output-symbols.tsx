import type { TransformModule } from '@builder.io/qwik/optimizer';
import { CodeBlock } from '../components/code-block/code-block';
import { $, component$, useSignal } from '@builder.io/qwik';
const FILE_MODULE_DIV_ID = 'file-modules-symbol';

export const ReplOutputSymbols = component$(({ outputs }: ReplOutputSymbolsProps) => {
  const selectedPath = useSignal(outputs.length ? outputs[0].path : '');
  const pathInView$ = $((path: string) => {
    selectedPath.value = path;
  });

  return (
    <div class="output-result output-modules">
      <div class="file-tree">
        <div class="file-tree-header">Symbols</div>
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
                <span>{o.segment?.canonicalFilename}</span>
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

interface ReplOutputSymbolsProps {
  outputs: TransformModule[];
}
