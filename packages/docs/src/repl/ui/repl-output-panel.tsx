import { component$, useComputed$ } from '@qwik.dev/core';
import { CodeBlock } from '../../components/code-block/code-block';
import type { ReplAppInput, ReplStore } from '../types';
import { ReplOutputModules } from './repl-output-modules';
import { ReplOutputSymbols } from './repl-output-segments';
import { ReplTabButton } from './repl-tab-button';
import { ReplTabButtons } from './repl-tab-buttons';
import {
  _dumpState,
  _getDomContainer,
  _preprocessState,
  _vnode_toString,
} from '@qwik.dev/core/internal';

export const ReplOutputPanel = component$(({ input, store }: ReplOutputPanelProps) => {
  const diagnosticsLen = store.diagnostics.length + store.monacoDiagnostics.length;

  const domContainerFromResultHtml = useComputed$(() => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(store.html, 'text/html');
      return _getDomContainer(doc.documentElement);
    } catch (err) {
      console.error(err);
      return null;
    }
  });

  const parsedState = useComputed$(() => {
    try {
      const container = domContainerFromResultHtml.value;
      const doc = container!.element;
      const qwikStates = doc.querySelectorAll('script[type="qwik/state"]');
      if (qwikStates.length !== 0) {
        const data = qwikStates[qwikStates.length - 1];
        const origState = JSON.parse(data?.textContent || '[]');
        _preprocessState(origState, container as any);
        return origState
          ? _dumpState(origState, false, '', null)
              //remove first new line
              .replace(/\n/, '')
          : 'No state found';
      }
      return 'No state found';
    } catch (err) {
      console.error(err);
      return null;
    }
  });

  const vdomTree = useComputed$(() => {
    try {
      const container = domContainerFromResultHtml.value;
      return _vnode_toString.call(
        container!.rootVNode as any,
        Number.MAX_SAFE_INTEGER,
        '',
        true,
        false,
        false
      );
    } catch (err) {
      console.error(err);
      return null;
    }
  });

  return (
    <div class="repl-panel repl-output-panel">
      <ReplTabButtons>
        <ReplTabButton
          text="App"
          isActive={store.selectedOutputPanel === 'app'}
          onClick$={async () => {
            store.selectedOutputPanel = 'app';
          }}
        />

        {store.enableHtmlOutput ? (
          <ReplTabButton
            text="HTML"
            isActive={store.selectedOutputPanel === 'html'}
            onClick$={async () => {
              store.selectedOutputPanel = 'html';
            }}
          />
        ) : null}

        {store.enableClientOutput ? (
          <ReplTabButton
            text="Segments"
            isActive={store.selectedOutputPanel === 'segments'}
            onClick$={async () => {
              store.selectedOutputPanel = 'segments';
            }}
          />
        ) : null}

        {store.enableClientOutput ? (
          <ReplTabButton
            text="Client Bundles"
            isActive={store.selectedOutputPanel === 'clientBundles'}
            onClick$={async () => {
              store.selectedOutputPanel = 'clientBundles';
            }}
          />
        ) : null}

        {store.enableSsrOutput ? (
          <ReplTabButton
            text="SSR Module"
            isActive={store.selectedOutputPanel === 'serverModules'}
            onClick$={async () => {
              store.selectedOutputPanel = 'serverModules';
            }}
          />
        ) : null}

        <ReplTabButton
          text={`Diagnostics${diagnosticsLen > 0 ? ` (${diagnosticsLen})` : ``}`}
          cssClass={{ 'repl-tab-diagnostics': true, 'has-errors': diagnosticsLen > 0 }}
          isActive={store.selectedOutputPanel === 'diagnostics'}
          onClick$={async () => {
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
          {store.isLoading && (
            <div class="repl-loading">
              <svg class="repl-spinner" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="24"
                  stroke-width="4"
                  stroke-dasharray="37.69911184307752 37.69911184307752"
                  fill="none"
                  stroke-linecap="round"
                />
              </svg>
            </div>
          )}
          {store.reload > 0 && (
            <iframe
              key={store.reload}
              class="repl-server"
              src={`/repl/client/${store.replId}/`}
              sandbox="allow-popups allow-modals allow-scripts allow-same-origin"
            />
          )}
        </div>

        {store.selectedOutputPanel === 'html' ? (
          <div class="output-result output-html flex flex-col gap-2">
            <span class="code-block-info">HTML</span>
            <CodeBlock language="markup" format code={store.html} />
            {parsedState.value ? (
              <div>
                <span class="code-block-info">Parsed State</span>
                <CodeBlock language="clike" code={parsedState.value} />
              </div>
            ) : null}
            {vdomTree.value ? (
              <div>
                <span class="code-block-info">VNode Tree</span>
                <CodeBlock language="markup" code={vdomTree.value} />
              </div>
            ) : null}
          </div>
        ) : null}

        {store.selectedOutputPanel === 'segments' ? (
          <ReplOutputSymbols outputs={store.transformedModules} />
        ) : null}

        {store.selectedOutputPanel === 'clientBundles' ? (
          <ReplOutputModules headerText="/dist/" outputs={store.clientBundles} />
        ) : null}

        {store.selectedOutputPanel === 'serverModules' ? (
          <ReplOutputModules headerText="/server/" outputs={store.ssrModules} />
        ) : null}

        {store.selectedOutputPanel === 'diagnostics' ? (
          <div class="output-result output-diagnostics">
            {diagnosticsLen === 0 ? (
              <p class="no-diagnostics">- No Reported Diagnostics -</p>
            ) : (
              [...store.diagnostics, ...store.monacoDiagnostics].map((d, key) => (
                <p key={key}>{d.message}</p>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
});

interface ReplOutputPanelProps {
  input: ReplAppInput;
  store: ReplStore;
}
