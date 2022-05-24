import type { QRL } from '@builder.io/qwik';
import { Editor } from './editor';
import { ReplTabButton } from './repl-tab-button';
import { ReplTabButtons } from './repl-tab-buttons';
import type { ReplStore, ReplModuleInput } from './types';

export const ReplInputPanel = ({
  store,
  inputs,
  onInputChangeQrl,
  onInputDeleteQrl,
}: ReplInputPanelProps) => {
  return (
    <div class="repl-panel repl-input-panel">
      <ReplTabButtons>
        {inputs.map((input) =>
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
      </ReplTabButtons>

      <div class="repl-tab">
        <Editor
          inputs={inputs}
          selectedPath={store.selectedInputPath}
          onChangeQrl={onInputChangeQrl}
          version={store.version!}
          store={store}
          ariaLabel="File Input"
          lineNumbers="on"
          wordWrap="off"
        />
      </div>
    </div>
  );
};

const formatFilePath = (path: string) => {
  const parts = path.split('/');
  return parts[parts.length - 1];
};

interface ReplInputPanelProps {
  store: ReplStore;
  inputs: ReplModuleInput[];
  onInputChangeQrl: QRL<(path: string, code: string) => void>;
  onInputDeleteQrl: QRL<(path: string) => void>;
}
