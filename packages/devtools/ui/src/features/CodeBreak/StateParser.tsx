import {
  $,
  component$,
  useSignal,
  useVisibleTask$,
  useStyles$,
} from '@qwik.dev/core';
import { _dumpState, _preprocessState } from '@qwik.dev/core/internal';
import { getHighlighter } from '../../utils/shiki';

export const StateParser = component$(() => {
  useStyles$(`
    pre.shiki { overflow: auto; padding: 10px;  height: 100%; }
  `);
  const inputState = useSignal('');
  const parsingTime = useSignal<number | null>(null);
  const stateResult = useSignal<string>('');
  const highlightedState = useSignal<string>('');

  const onParseState$ = $(() => {
    if (!inputState.value.trim()) {
      parsingTime.value = null;
      stateResult.value = '// Paste state on the left to parse';
      return;
    }

    const startTime = performance.now();

    try {
      const stateData = JSON.parse(inputState.value);
      const container = {
        $getObjectById$: (id: number | string) => id,
        element: null,
        getSyncFn: () => () => {},
        $storeProxyMap$: new WeakMap(),
        $forwardRefs$: null,
        $initialQRLsIndexes$: null,
        $scheduler$: null,
      };
      _preprocessState(stateData, container as any);
      const dumpedState = _dumpState(stateData, false, '', null).replace(
        /\n/,
        '',
      );
      parsingTime.value = performance.now() - startTime;
      stateResult.value = dumpedState;
      return;
    } catch (error) {
      try {
        const cleanInput = inputState.value
          .replace(/<script[^>]*>/gi, '')
          .replace(/<\/script>/gi, '')
          .trim();
        if (cleanInput) {
          const stateData = JSON.parse(cleanInput);
          const container = {
            $getObjectById$: (id: number | string) => id,
            element: null,
            getSyncFn: () => () => {},
            $storeProxyMap$: new WeakMap(),
            $forwardRefs$: null,
            $initialQRLsIndexes$: null,
            $scheduler$: null,
          };
          _preprocessState(stateData, container as any);
          const dumpedState = _dumpState(stateData, false, '', null);
          parsingTime.value = performance.now() - startTime;
          stateResult.value = dumpedState;
          return;
        }
      } catch {
        parsingTime.value = performance.now() - startTime;
        stateResult.value = `// Error parsing state: ${error instanceof Error ? error.message : 'Invalid state format'}\n\n// Raw input:\n${inputState.value}`;
        return;
      }
    }

    parsingTime.value = performance.now() - startTime;
    stateResult.value = '// Unable to parse the provided state';
  });

  const shikiRef = useSignal<any>(null);
  useVisibleTask$(async ({ track }) => {
    track(() => stateResult?.value);
    const currentState = stateResult?.value ?? '';
    if (!currentState) {
      if (highlightedState) {
        highlightedState.value = '';
      }
      return;
    }
    try {
      if (!shikiRef?.value) {
        if (shikiRef) {
          shikiRef.value = await getHighlighter();
        }
      }
      if (!shikiRef?.value) {
        if (highlightedState) {
          highlightedState.value = currentState;
        }
        return;
      }
      if (highlightedState) {
        highlightedState.value = shikiRef.value.codeToHtml(currentState, {
          lang: 'json',
          theme: 'nord',
        });
      }
    } catch {
      if (highlightedState) {
        highlightedState.value = currentState;
      }
    }
  });

  return (
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="border-glass-border bg-card-item-bg flex h-[60vh] min-h-0 flex-col rounded-xl border">
        <div class="border-glass-border flex items-center justify-between border-b p-3">
          <div class="text-sm font-medium">Input State</div>
          {parsingTime.value !== null && (
            <span class="border-glass-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
              {parsingTime.value}ms
            </span>
          )}
        </div>
        <div class="min-h-0 flex-1 flex-col space-y-3 p-3">
          <textarea
            value={inputState.value}
            onInput$={(e: InputEvent, t: HTMLTextAreaElement) =>
              (inputState.value = (t as HTMLTextAreaElement).value)
            }
            placeholder="Paste Qwik state and click to parse/format."
            class="border-glass-border bg-card-item-bg text-foreground placeholder:text-muted-foreground h-full min-h-0 w-full flex-1 resize-none rounded-md border p-3 font-mono text-sm"
          />
          <div class="flex items-center gap-3">
            <button
              onClick$={onParseState$}
              class="bg-accent rounded-md px-3 py-1.5 text-sm text-white hover:opacity-90"
            >
              Parse State
            </button>
          </div>
        </div>
      </div>

      <div class="border-glass-border bg-card-item-bg flex h-[60vh] min-h-0 flex-col overflow-hidden rounded-xl border">
        <div class="border-glass-border flex items-center justify-between border-b p-3">
          <div class="text-sm font-medium">Parsed State</div>
          {parsingTime.value !== null && (
            <span class="border-glass-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
              {parsingTime.value}ms
            </span>
          )}
        </div>
        <div class="h-full min-h-0 flex-1">
          <pre
            class="h-full overflow-auto"
            dangerouslySetInnerHTML={highlightedState.value || ''}
          />
        </div>
      </div>
    </div>
  );
});
