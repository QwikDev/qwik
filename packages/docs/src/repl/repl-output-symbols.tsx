import type { TransformModule } from '@builder.io/qwik/optimizer';
import { CodeBlock } from '../components/code-block/code-block';
import { $, useStore, component$ } from '@builder.io/qwik';
import type { PathInView } from './types';
const FILE_MODULE_DIV_ID = 'file-modules-symbol';

export const ReplOutputSymbols = component$(({ outputs }: ReplOutputSymbolsProps) => {
  const store = useStore<PathInView>({
    selectedPath: outputs.length ? outputs[0].path : '',
  });
  const pathInView$ = $((path: string) => {
    store.selectedPath = path;
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
                  const fileItem = document.querySelector(`[data-file-item="${i}"]`);
                  if (fileItem) {
                    store.selectedPath = o.path;
                    fileItem.scrollIntoView();
                  }
                }}
                class={{
                  'in-view': store.selectedPath && store.selectedPath === o.path,
                  '!hidden': true,
                  'md:!block': true,
                }}
                preventdefault:click
              >
                {o.hook?.canonicalFilename}
              </a>
              <div class="block md:hidden">
                <div class="file-item" data-file-item={i} key={o.path}>
                  <div class="file-info">
                    <span>{o.hook?.canonicalFilename}</span>
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
              </div>
            </div>
          ))}
        </div>
      </div>
      <div class="file-modules hidden md:block" id={FILE_MODULE_DIV_ID}>
        {outputs
          .filter((o) => !!o.hook)
          .map((o, i) => (
            <div class="file-item" data-file-item={i} key={o.path}>
              <div class="file-info">
                <span>{o.hook?.canonicalFilename}</span>
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
