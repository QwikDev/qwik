import { ReplOptions } from './repl-options';
import { ReplTabButton } from './repl-tab-button';
import type { ReplStore } from './types';

export const ReplDetailPanel = ({ store }: ReplDetailPanelProps) => {
  return (
    <div class="repl-panel repl-detail-panel">
      <div class="repl-tab-buttons">
        <ReplTabButton
          text="Options"
          isActive={store.selectedOutputDetail === 'options'}
          onClick$={() => {
            store.selectedOutputDetail = 'options';
          }}
        />

        {/* <ReplTabButton
          text="Network"
          isActive={store.selectedOutputDetail === 'network'}
          onClick$={() => {
            store.selectedOutputDetail = 'network';
          }}
        /> */}

        {/* <ReplTabButton
          text="Usage"
          isActive={store.selectedOutputDetail === 'usage'}
          onClick$={() => {
            store.selectedOutputDetail = 'usage';
          }}
        /> */}
      </div>

      <div class="repl-tab">
        {store.selectedOutputDetail === 'options' ? <ReplOptions store={store} /> : null}

        {/* {store.selectedOutputDetail === 'network' ? (
          <div class="output-detail detail-network">network</div>
        ) : null} */}

        {/* {store.selectedOutputDetail === 'usage' ? (
          <div class="output-detail detail-usage">usage</div>
        ) : null} */}
      </div>
    </div>
  );
};

interface ReplDetailPanelProps {
  store: ReplStore;
}
