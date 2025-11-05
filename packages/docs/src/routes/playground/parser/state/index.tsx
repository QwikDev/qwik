import { component$, useSignal, useComputed$, useStyles$ } from '@qwik.dev/core';
import { _dumpState, _preprocessState } from '@qwik.dev/core/internal';
import type { DocumentHead } from '@qwik.dev/router';

export default component$(() => {
  useStyles$(`
    pre {
      background: none !important;
    }
    
    /* Ensure code block can scroll horizontally */
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

  const inputState = useSignal('');
  const parsingTime = useSignal<number | null>(null);

  const parsedState = useComputed$(() => {
    if (!inputState.value.trim()) {
      parsingTime.value = null;
      return '// Parsed state will appear here after you paste data in the left panel';
    }

    const startTime = performance.now();

    try {
      // Try to parse the input as Qwik state
      const stateData = JSON.parse(inputState.value);

      // Create a simple container for state processing
      const container = {
        $getObjectById$: (id: number | string) => id,
        element: null,
        getSyncFn: (id: number) => () => {},
        $storeProxyMap$: new WeakMap(),
        $forwardRefs$: null,
        $scheduler$: null,
      };

      // Preprocess the state for Qwik
      _preprocessState(stateData, container as any);

      // Dump the state in a readable format
      const dumpedState = _dumpState(stateData, false, '', null)
        //remove first new line
        .replace(/\n/, '');

      parsingTime.value = performance.now() - startTime;
      return dumpedState;
    } catch (error) {
      // If parsing fails, try to clean the input and retry
      try {
        // Remove any script tags and extract content
        const cleanInput = inputState.value
          .replace(/<script[^>]*>/gi, '')
          .replace(/<\/script>/gi, '')
          .trim();

        if (cleanInput) {
          const stateData = JSON.parse(cleanInput);
          const container = {
            $getObjectById$: (id: number | string) => id,
            element: null,
            getSyncFn: (id: number) => () => {},
            $storeProxyMap$: new WeakMap(),
            $forwardRefs$: null,
            $scheduler$: null,
          };
          _preprocessState(stateData, container as any);
          const dumpedState = _dumpState(stateData, false, '', null);
          parsingTime.value = performance.now() - startTime;
          return dumpedState;
        }
      } catch (secondError) {
        parsingTime.value = performance.now() - startTime;
        return `// Error parsing state: ${error instanceof Error ? error.message : 'Invalid state format'}\n\n// Raw input:\n${inputState.value}`;
      }
    }

    parsingTime.value = performance.now() - startTime;
    return '// Unable to parse the provided state';
  });

  return (
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-8 h-[calc(100vh-400px)]">
      {/* Left Column - Input with enhanced styling */}
      <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-gray-700 overflow-hidden flex flex-col">
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-600 px-6 py-4 border-b border-blue-100 dark:border-gray-600">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <svg
                class="w-4 h-4 text-gray-900"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Input State</h2>
              <p class="text-sm text-gray-600 dark:text-gray-300">Paste your Qwik state data</p>
            </div>
          </div>
        </div>
        <div class="p-6 flex-1 flex flex-col">
          <textarea
            bind:value={inputState}
            placeholder="Paste your state here..."
            class="w-full flex-1 p-4 text-sm font-mono bg-gray-50/50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all duration-200 placeholder:text-gray-600 dark:placeholder:text-gray-400 placeholder:opacity-100 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            spellcheck={false}
          />
        </div>
      </div>

      {/* Right Column - Output with enhanced styling */}
      <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-gray-700 overflow-hidden flex flex-col">
        <div class="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-gray-700 dark:to-gray-600 px-6 py-4 border-b border-green-100 dark:border-gray-600">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <svg
                  class="w-4 h-4 text-gray-900"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Parsed State</h2>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  Formatted and syntax-highlighted output
                </p>
              </div>
            </div>
            {parsingTime.value !== null && (
              <div class="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <svg
                  class="w-4 h-4 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span class="text-sm font-medium text-green-700 dark:text-green-300">
                  {parsingTime.value < 1
                    ? `${(parsingTime.value * 1000).toFixed(0)}μs`
                    : `${parsingTime.value.toFixed(2)}ms`}
                </span>
              </div>
            )}
          </div>
        </div>
        <div class="p-6 flex-1 code-output-container">
          <div class="rounded-xl border border-gray-200 dark:border-gray-600 text-sm shadow-inner bg-gray-900 p-4">
            <pre>{parsedState.value}</pre>
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'State Parser',
  meta: [
    {
      name: 'description',
      content: 'Parse Qwik state data',
    },
  ],
};
