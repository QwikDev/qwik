import { component$, useSignal, useComputed$ } from '@qwik.dev/core';
import { _dumpState, _preprocessState } from '@qwik.dev/core/internal';
import { CodeBlock } from '../../../components/code-block/code-block';

export default component$(() => {
  const inputState = useSignal('');

  const parsedState = useComputed$(() => {
    if (!inputState.value.trim()) {
      return '// Parsed state will appear here after you paste data in the left panel';
    }

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
        $initialQRLsIndexes$: null,
        $scheduler$: null,
      };

      // Preprocess the state for Qwik
      _preprocessState(stateData, container as any);

      // Dump the state in a readable format
      const dumpedState = _dumpState(stateData, false, '', null);

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
            $initialQRLsIndexes$: null,
            $scheduler$: null,
          };
          _preprocessState(stateData, container as any);
          const dumpedState = _dumpState(stateData, false, '', null);
          return dumpedState;
        }
      } catch (secondError) {
        return `// Error parsing state: ${error instanceof Error ? error.message : 'Invalid state format'}\n\n// Raw input:\n${inputState.value}`;
      }
    }

    return '// Unable to parse the provided state';
  });

  return (
    <div class="min-h-screen p-4 bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-slate-800">
      <div class="max-w-7xl mx-auto">
        {/* Header with improved styling */}
        <div class="text-center mb-8">
          <div class="inline-flex items-center gap-3 mb-4">
            <div class="w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl flex items-center justify-center">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <h1 class="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
              State Parser
            </h1>
          </div>
          <p class="max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-300">
            Transform your Qwik state data into beautifully formatted and syntax-highlighted output
          </p>
        </div>

        {/* Main Content with improved layout */}
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-8 h-[calc(100vh-280px)]">
          {/* Left Column - Input with enhanced styling */}
          <div class="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 dark:border-gray-700 overflow-hidden flex flex-col">
            <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-600 px-6 py-4 border-b border-blue-100 dark:border-gray-600">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                  <svg
                    class="w-4 h-4 text-white"
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
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                  <svg
                    class="w-4 h-4 text-white"
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
            </div>
            <div class="p-6 flex-1 overflow-auto">
              <div class="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 text-sm max-w-full shadow-inner bg-gray-900">
                <CodeBlock code={parsedState.value} language="clike" />
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Footer */}
        <div class="mt-8 text-center">
          <div class="inline-flex items-center gap-2 px-4 py-2 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-full border border-white/20 dark:border-gray-600">
            <svg
              class="w-4 h-4 text-blue-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p class="text-sm text-gray-600 dark:text-gray-300">
              Perfect for debugging Qwik applications and analyzing state structure
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
