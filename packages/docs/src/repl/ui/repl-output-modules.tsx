import { $, component$, createSignal, useSignal } from '@qwik.dev/core';
import { CodeBlock } from '../../components/code-block/code-block';
import type { ReplModuleOutput } from '../types';
const FILE_MODULE_DIV_ID = 'file-modules-client-modules';

export const ReplOutputModules = component$(({ outputs, headerText }: ReplOutputModulesProps) => {
  const selectedPath = useSignal(outputs.length ? outputs[0].path : '');
  const pathInView$ = $((path: string) => {
    selectedPath.value = path;
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
      <div class="file-modules" id={FILE_MODULE_DIV_ID}>
        {outputs.map((o, i) => {
          const isLarge = o.code.length > 3000;
          if (isLarge && !o.shorten) {
            o.shorten = createSignal(true);
          }
          const code = o.shorten?.value ? o.code.slice(0, 3000) : o.code;
          return (
            <div class="file-item" data-output-item={i} key={o.path}>
              <div class="file-info">
                <span>{o.path}</span>
                {o.size ? <span class="file-size">({o.size})</span> : null}
              </div>
              <div class="file-text">
                <CodeBlock
                  pathInView$={pathInView$}
                  path={o.path}
                  code={code}
                  observerRootId={FILE_MODULE_DIV_ID}
                />
                {o.shorten && (
                  <button onClick$={() => (o.shorten!.value = !o.shorten!.value)}>
                    {o.shorten!.value ? 'Truncated - show more' : 'Show less'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

interface ReplOutputModulesProps {
  headerText: string;
  outputs: ReplModuleOutput[];
}
