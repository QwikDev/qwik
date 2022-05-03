import type { QRL } from '@builder.io/qwik';
import { Editor } from './editor';
import { ReplTabButton } from './repl-tab-button';
import type { ReplStore } from './types';

export const ReplInputPanel = ({
  store,
  onInputChangeQrl,
  onInputDeleteQrl,
}: ReplInputPanelProps) => {
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
                  onInputDeleteQrl.invoke(input.path);
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
          onChangeQrl={onInputChangeQrl}
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
  onInputChangeQrl: QRL<(path: string, code: string) => void>;
  onInputDeleteQrl: QRL<(path: string) => void>;
}
