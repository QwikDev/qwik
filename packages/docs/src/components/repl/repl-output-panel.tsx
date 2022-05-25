import { CodeBlock } from '../code-block/code-block';
import { ReplOutputModules } from './repl-output-modules';
import { ReplTabButton } from './repl-tab-button';
import { ReplTabButtons } from './repl-tab-buttons';
import type { ReplAppInput, ReplStore } from './types';

export const ReplOutputPanel = ({ input, store }: ReplOutputPanelProps) => {
  const diagnosticsLen = store.diagnostics.length + store.monacoDiagnostics.length;

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
            isActive={store.selectedOutputPanel === 'html'}
            onClick$={() => {
              store.selectedOutputPanel = 'html';
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

        <ReplTabButton
          text={`Diagnostics${diagnosticsLen > 0 ? ` (${diagnosticsLen})` : ``}`}
          cssClass={{ 'repl-tab-diagnostics': true }}
          isActive={store.selectedOutputPanel === 'diagnostics'}
          onClick$={() => {
            store.selectedOutputPanel = 'diagnostics';
          }}
        />
      </ReplTabButtons>

      <div
        class={{
          'repl-tab': true,
          'repl-mode-production': input.buildMode === 'production',
          'repl-mode-development': input.buildMode !== 'production',
        }}
      >
        <div
          class={{
            'output-result': true,
            'output-app': true,
            'output-app-active': store.selectedOutputPanel === 'app',
          }}
        >
          <iframe class="repl-server" src={store.serverUrl} />
        </div>

        {store.selectedOutputPanel === 'html' ? (
          <div class="output-result output-html">
            <CodeBlock language="markup" code={store.html} theme="light" />
          </div>
        ) : null}

        {store.selectedOutputPanel === 'clientModules' ? (
          <ReplOutputModules buildPath="/build/" outputs={store.clientModules} />
        ) : null}

        {store.selectedOutputPanel === 'serverModules' ? (
          <ReplOutputModules buildPath="/server/" outputs={store.ssrModules} />
        ) : null}

        {store.selectedOutputPanel === 'diagnostics' ? (
          <div class="output-result output-diagnostics">
            {[...store.diagnostics, ...store.monacoDiagnostics].map((d) => (
              <p>{d.message}</p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};

interface ReplOutputPanelProps {
  input: ReplAppInput;
  store: ReplStore;
}
