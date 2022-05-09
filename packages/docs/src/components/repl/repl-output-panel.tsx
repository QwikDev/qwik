import { CodeBlock } from '../code-block/code-block';
import { ReplOutputModles } from './repl-output-modules';
import { ReplTabButton } from './repl-tab-button';
import { ReplTabButtons } from './repl-tab-buttons';
import type { ReplStore } from './types';

export const ReplOutputPanel = ({ store }: ReplOutputPanelProps) => {
  return (
    <div class="repl-panel repl-output-panel">
      <ReplTabButtons>
        <ReplTabButton
          text="App"
          isActive={store.selectedOutputPanel === 'app'}
          onClick$={() => {
            store.selectedOutputPanel = 'app';
          }}
        />

        {store.enableHtmlOutput ? (
          <ReplTabButton
            text="HTML"
            isActive={store.selectedOutputPanel === 'outputHtml'}
            onClick$={() => {
              store.selectedOutputPanel = 'outputHtml';
            }}
          />
        ) : null}

        {store.enableClientOutput ? (
          <ReplTabButton
            text="Client Modules"
            isActive={store.selectedOutputPanel === 'clientModules'}
            onClick$={() => {
              store.selectedOutputPanel = 'clientModules';
            }}
          />
        ) : null}

        {store.enableSsrOutput ? (
          <ReplTabButton
            text="SSR Module"
            isActive={store.selectedOutputPanel === 'serverModules'}
            onClick$={() => {
              store.selectedOutputPanel = 'serverModules';
            }}
          />
        ) : null}

        {store.diagnostics.length > 0 ? (
          <ReplTabButton
            text={`Diagnostics (${store.diagnostics.length})`}
            cssClass={{ 'repl-tab-diagnostics': true }}
            isActive={store.selectedOutputPanel === 'diagnostics'}
            onClick$={() => {
              store.selectedOutputPanel = 'diagnostics';
            }}
          />
        ) : null}
      </ReplTabButtons>

      <div
        class={{
          'repl-tab': true,
          'repl-mode-production': store.buildMode === 'production',
          'repl-mode-development': store.buildMode !== 'production',
        }}
      >
        <div
          class={{
            'output-result': true,
            'output-app': true,
            'output-app-active': store.selectedOutputPanel === 'app',
          }}
        >
          <iframe src={store.iframeUrl} />
        </div>

        {store.selectedOutputPanel === 'outputHtml' ? (
          <div class="output-result output-html">
            <CodeBlock language="markup" code={store.outputHtml} theme="light" />
          </div>
        ) : null}

        {store.selectedOutputPanel === 'clientModules' ? (
          <ReplOutputModles buildPath="/build/" outputs={store.clientModules} />
        ) : null}

        {store.selectedOutputPanel === 'serverModules' ? (
          <ReplOutputModles buildPath="/server/" outputs={store.ssrModules} />
        ) : null}

        {store.selectedOutputPanel === 'diagnostics' ? (
          <div class="output-result output-diagnostics">
            {store.diagnostics.map((d) => (
              <p>{d.message}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

interface ReplOutputPanelProps {
  store: ReplStore;
}
