import { component$, type QRL } from '@qwik.dev/core';

export type RenderTreeTabId = 'state' | 'code';

interface RenderTreeTabsProps {
  currentTab: RenderTreeTabId;
  onStateClick$: QRL<() => void>;
  onCodeClick$: QRL<() => void>;
}

export const RenderTreeTabs = component$<RenderTreeTabsProps>(
  ({ currentTab, onStateClick$, onCodeClick$ }) => {
    return (
      <div class="border-glass-border flex space-x-2 border-b pb-1">
        {(['state', 'code'] as const).map((tabId) => (
          <button
            key={tabId}
            onClick$={tabId === 'state' ? onStateClick$ : onCodeClick$}
            class={[
              'rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
              currentTab === tabId
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5',
            ]}
            style={
              currentTab === tabId
                ? {
                    boxShadow: 'inset 0 -2px 0 0 var(--color-primary)',
                  }
                : {}
            }
          >
            {tabId === 'state' ? 'State' : 'Code'}
          </button>
        ))}
      </div>
    );
  },
);
