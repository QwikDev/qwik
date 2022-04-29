import type { ReplModuleOutput } from './types';

export const ReplOutputModles = ({ outputs, buildPath }: ReplOutputModulesProps) => {
  return (
    <div class="output-result output-modules">
      <div class="file-tree">
        <div class="file-tree-header">{buildPath}</div>
        <div class="file-tree-items">
          {outputs.map((o, i) => (
            <a
              href="#"
              onClick$={() => {
                const fileItem = document.querySelector(`[data-file-item="${i}"]`);
                if (fileItem) {
                  fileItem.scrollIntoView();
                }
              }}
              preventDefault:click
            >
              {o.path}
            </a>
          ))}
        </div>
      </div>
      <div class="file-modules">
        {outputs.map((o, i) => (
          <div class="file-item" data-file-item={i}>
            <div class="file-info">
              <span>{o.path}</span>
              <span class="file-size">({o.size})</span>
            </div>
            <pre class="file-text">{o.code}</pre>
          </div>
        ))}
      </div>
    </div>
  );
};

interface ReplOutputModulesProps {
  buildPath: string;
  outputs: ReplModuleOutput[];
}
