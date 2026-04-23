import { component$, useSignal, useStyles$ } from '@qwik.dev/core';
import { StateParser } from './StateParser';
import { HtmlParser } from './HtmlParser';

type ParserTab = 'state' | 'html';

export const CodeBreak = component$(() => {
  useStyles$(`
  .code-output-container {
    overflow-x: auto;
    overflow-y: auto;
  }
  .code-output-container > div {
    width: fit-content;
    min-width: 100%;
  }
  .code-output-container pre[class*='language-'] {
    margin: 0;
    min-width: max-content;
  }
  `);

  const currentTab = useSignal<ParserTab>('state');

  return (
    <div class="h-full space-y-6 overflow-hidden">
      <div class="flex justify-center">
        <div class="border-glass-border bg-card-item-bg inline-flex rounded-xl border p-0.5">
          <button
            onClick$={() => (currentTab.value = 'state')}
            class={{
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors md:px-4': true,
              'bg-accent text-white shadow': currentTab.value === 'state',
              'text-muted-foreground hover:bg-foreground/5':
                currentTab.value !== 'state',
            }}
          >
            State Parser
          </button>
          <button
            onClick$={() => (currentTab.value = 'html')}
            class={{
              'rounded-lg px-3 py-2 text-sm font-medium transition-colors md:px-4': true,
              'bg-accent text-white shadow': currentTab.value === 'html',
              'text-muted-foreground hover:bg-foreground/5':
                currentTab.value !== 'html',
            }}
          >
            HTML Parser
          </button>
        </div>
      </div>

      {currentTab.value === 'state' && <StateParser />}
      {currentTab.value === 'html' && <HtmlParser />}
    </div>
  );
});
