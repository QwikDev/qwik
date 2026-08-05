import { component$, type QRL } from '@qwik.dev/core';

export interface OperationFeedback {
  type: 'success' | 'error';
  message: string;
  retryAction?: 'install' | 'update';
  packageName?: string;
}

interface DependencyOperationFeedbackProps {
  feedback: OperationFeedback | null;
  onRetry$: QRL<() => void>;
  onDismiss$: QRL<() => void>;
}

export const DependencyOperationFeedback = component$(
  ({ feedback, onRetry$, onDismiss$ }: DependencyOperationFeedbackProps) => {
    if (!feedback) {
      return null;
    }

    const isError = feedback.type === 'error';

    return (
      <div
        class={[
          'rounded-xl border px-4 py-3 text-sm',
          isError
            ? 'border-red-500/20 bg-red-500/10 text-red-300'
            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
        ].join(' ')}
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span>{feedback.message}</span>
          <div class="flex items-center gap-2">
            {isError && feedback.retryAction ? (
              <button
                type="button"
                onClick$={onRetry$}
                class="rounded-lg bg-foreground/10 px-2.5 py-1 text-xs hover:bg-foreground/20"
              >
                Retry
              </button>
            ) : null}
            <button
              type="button"
              onClick$={onDismiss$}
              class="rounded-lg bg-foreground/10 px-2.5 py-1 text-xs hover:bg-foreground/20"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }
);
