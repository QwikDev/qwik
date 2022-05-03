import { Editor } from './editor';
import { ReplTabButton } from './repl-tab-button';
import type { ReplStore } from './types';

export const ReplInputPanel = ({ store, onInputChange, onInputDelete }: ReplInputPanelProps) => {
  return (
    <div class="repl-panel repl-input-panel">
      <div class="repl-tab-buttons">
        {store.inputs.map((input) =>
          input.hidden ? null : (
            <ReplTabButton
              text={formatFilePath(input.path)}
              isActive={store.selectedInputPath === input.path}
              onClick$={() => {
                store.selectedInputPath = input.path;
              }}
              onClose$={() => {
                const shouldDelete = confirm(`Are you sure you want to delete "${input.path}"?`);
                if (shouldDelete) {
                  onInputDelete(input.path);
                }
              }}
            />
          )
        )}
      </div>

      <div class="repl-tab">
        <Editor
          inputs={store.inputs}
          selectedPath={store.selectedInputPath}
          onChange={onInputChange}
          version={store.version!}
          ariaLabel="File Input"
          lineNumbers="on"
          readOnly={false}
          wordWrap="off"
        />
      </div>
    </div>
  );
};

const formatFilePath = (path: string) => {
  if (path.startsWith('/')) {
    return path.substring(1);
  }
  return path;
};

interface ReplInputPanelProps {
  store: ReplStore;
  onInputChange: (path: string, code: string) => void;
  onInputDelete: (path: string) => void;
}
