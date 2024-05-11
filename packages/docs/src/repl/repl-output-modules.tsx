import { $, useStore, component$ } from '@builder.io/qwik';
import { CodeBlock } from '../components/code-block/code-block';
import type { PathInView, ReplModuleOutput } from './types';
const FILE_MODULE_DIV_ID = 'file-modules-client-buisness';

export const ReplOutputModules = component$(({ outputs, headerText }: ReplOutputModulesProps) => {
  const store = useStore<PathInView>({
    selectedPath: outputs.length ? outputs[0].path : '',
  });
  const pathInView$ = $((path: string) => {
    store.selectedPath = path;
  });
  return (
    <div class="output-result output-modules">
      <div class="file-tree">
        <div class="file-tree-header">{outputs.length > 0 ? headerText : ''}</div>
        <div class="file-tree-items">
          {outputs.map((o, i) => (
            <div key={o.path}>
              <a
                href="#"
                onClick$={() => {
                  const fileItem = document.querySelector(`[data-file-item="${i}"]`);
                  if (fileItem) {
                    fileItem.scrollIntoView();
                  }
                }}
                class={{
                  'in-view': store.selectedPath && store.selectedPath === o.path,
                  '!hidden': true,
                  'md:!block': true,
                }}
                preventdefault:click
                key={o.path}
              >
                {o.path}
              </a>
              <div class="block md:hidden">
                <div class="file-item" data-file-item={i} key={o.path}>
                  <div class="file-info">
                    <span>{o.path}</span>
                    {o.size ? <span class="file-size">({o.size})</span> : null}
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
      <div class="file-modules" id={FILE_MODULE_DIV_ID}>
        {outputs.map((o, i) => (
          <div class="file-item" data-file-item={i} key={o.path}>
            <div class="file-info">
              <span>{o.path}</span>
              {o.size ? <span class="file-size">({o.size})</span> : null}
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

interface ReplOutputModulesProps {
  headerText: string;
  outputs: ReplModuleOutput[];
}
