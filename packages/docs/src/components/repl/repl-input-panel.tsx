import type { QRL } from '@builder.io/qwik';
import { Editor } from './editor';
import { ReplCommands } from './repl-commands';
import { ReplTabButton } from './repl-tab-button';
import { ReplTabButtons } from './repl-tab-buttons';
import type { ReplStore, ReplAppInput } from './types';

export const ReplInputPanel = ({
  input,
  store,
  onInputChangeQrl,
  onInputDeleteQrl,
  enableCopyToPlayground,
  enableDownload,
  enableInputDelete,
}: ReplInputPanelProps) => {
  return (
    <div class="repl-panel repl-input-panel">
      <ReplTabButtons>
        {input.files.map((f) =>
          f.hidden ? null : (
            <ReplTabButton
              text={formatFilePath(f.path)}
              isActive={store.selectedInputPath === f.path}
              onClick$={() => {
                store.selectedInputPath = f.path;
              }}
              onClose$={() => {
                const shouldDelete = confirm(`Are you sure you want to delete "${f.path}"?`);
                if (shouldDelete) {
                  onInputDeleteQrl.invoke(f.path);
                }
              }}
              enableInputDelete={enableInputDelete}
            />
          )
        )}
        <ReplCommands
          input={input}
          enableCopyToPlayground={enableCopyToPlayground}
          enableDownload={enableDownload}
        />
      </ReplTabButtons>

      <div class="repl-tab">
        <Editor
          input={input}
          onChangeQrl={onInputChangeQrl}
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
  input: ReplAppInput;
  store: ReplStore;
  onInputChangeQrl: QRL<(path: string, code: string) => void>;
  onInputDeleteQrl: QRL<(path: string) => void>;
  enableDownload?: boolean;
  enableCopyToPlayground?: boolean;
  enableInputDelete?: boolean;
}
