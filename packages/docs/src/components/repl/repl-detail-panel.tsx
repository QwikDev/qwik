import { ReplConsole } from './repl-console';
import { ReplOptions } from './repl-options';
import { ReplTabButton } from './repl-tab-button';
import { ReplTabButtons } from './repl-tab-buttons';
import type { ReplStore } from './types';

export const ReplDetailPanel = ({ store }: ReplDetailPanelProps) => {
  return (
    <div class="repl-panel repl-detail-panel">
      <ReplTabButtons>
        <ReplTabButton
          text="Options"
          isActive={store.selectedOutputDetail === 'options'}
          onClick$={() => {
            store.selectedOutputDetail = 'options';
          }}
        />

        <ReplTabButton
          text="Console"
          isActive={store.selectedOutputDetail === 'console'}
          onClick$={() => {
            store.selectedOutputDetail = 'console';
          }}
        />
      </ReplTabButtons>

      <div class="repl-tab">
        {store.selectedOutputDetail === 'options' ? <ReplOptions store={store} /> : null}
        {store.selectedOutputDetail === 'console' ? <ReplConsole store={store} /> : null}
      </div>
    </div>
  );
};

interface ReplDetailPanelProps {
  store: ReplStore;
}
