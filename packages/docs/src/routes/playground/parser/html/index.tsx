import { component$, useComputed$, useSignal, useStyles$ } from '@qwik.dev/core';
import { _getDomContainer, _vnode_toString } from '@qwik.dev/core/internal';
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

  const inputHtml = useSignal('');
  const parsingTime = useSignal<number | null>(null);

  const parsedHtml = useComputed$(() => {
    if (!inputHtml.value.trim()) {
      parsingTime.value = null;
      return '// VNode tree will appear here after you paste HTML in the left panel';
    }

    const startTime = performance.now();

    try {
      // Use DOMParser for basic HTML parsing
      const parser = new DOMParser();
      const doc = parser.parseFromString(inputHtml.value, 'text/html');

      let output = '';

      // Try to get Qwik container if available
      try {
        const container = _getDomContainer(doc.body.firstElementChild!);
        if (container) {
          output += '// Qwik Container Found:\n';
          output += `- Container Type: ${container.qContainer}\n`;
          output += `- Manifest Hash: ${container.qManifestHash}\n\n`;

          // Try to get VNode tree first
          try {
            const vdomTree = _vnode_toString.call(
              container!.rootVNode as any,
              Number.MAX_SAFE_INTEGER,
              '',
              true,
              false,
              false
            );
            output += '// VNode Tree:\n' + vdomTree + '\n\n';
          } catch (vnodeErr) {
            output += '// VNode parsing error: ' + vnodeErr + '\n\n';
          }
        } else {
          output = '// No Qwik container found in the HTML';
        }
      } catch (containerErr) {
        output = '// No Qwik container found or error: ' + containerErr;
      }

      parsingTime.value = performance.now() - startTime;
      return output;
    } catch (error) {
      parsingTime.value = performance.now() - startTime;
      return `// Error parsing HTML: ${error instanceof Error ? error.message : 'Invalid HTML format'}\n\n// Raw input:\n${inputHtml.value}`;
    }
  });

  return (
    <div class="grid h-[calc(100vh-400px)] grid-cols-1 gap-8 xl:grid-cols-2">
      {/* Left Column - Input with enhanced styling */}
      <div class="flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-xl backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/80">
        <div class="border-b border-green-100 bg-gradient-to-r from-green-50 to-teal-50 px-6 py-4 dark:border-gray-600 dark:from-gray-700 dark:to-gray-600">
          <div class="flex items-center gap-3">
            <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500">
              <svg
                class="h-4 w-4 text-gray-900"
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
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Input HTML</h2>
              <p class="text-sm text-gray-600 dark:text-gray-300">Paste your HTML code</p>
            </div>
          </div>
        </div>
        <div class="flex flex-1 flex-col p-6">
          <textarea
            bind:value={inputHtml}
            placeholder="Paste your HTML here..."
            class="w-full flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50/50 p-4 font-mono text-sm text-gray-900 transition-all duration-200 placeholder:text-gray-600 placeholder:opacity-100 hover:bg-gray-50 focus:border-green-500 focus:ring-2 focus:ring-green-500 dark:border-gray-600 dark:bg-gray-700/50 dark:text-white dark:placeholder:text-gray-400 dark:hover:bg-gray-700"
            spellcheck={false}
          />
        </div>
      </div>

      {/* Right Column - Output with enhanced styling */}
      <div class="flex flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/80 shadow-xl backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/80">
        <div class="border-b border-teal-100 bg-gradient-to-r from-teal-50 to-cyan-50 px-6 py-4 dark:border-gray-600 dark:from-gray-700 dark:to-gray-600">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500">
                <svg
                  class="h-4 w-4 text-gray-900"
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
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">VNode Tree</h2>
                <p class="text-sm text-gray-600 dark:text-gray-300">
                  Qwik container VNode tree structure
                </p>
              </div>
            </div>
            {parsingTime.value !== null && (
              <div class="flex items-center gap-2 rounded-lg bg-teal-100 px-3 py-1 dark:bg-teal-900/30">
                <svg
                  class="h-4 w-4 text-teal-600 dark:text-teal-400"
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
                <span class="text-sm font-medium text-teal-700 dark:text-teal-300">
                  {parsingTime.value < 1
                    ? `${(parsingTime.value * 1000).toFixed(0)}μs`
                    : `${parsingTime.value.toFixed(2)}ms`}
                </span>
              </div>
            )}
          </div>
        </div>
        <div class="code-output-container flex-1 p-6">
          <div class="rounded-xl border border-gray-200 bg-gray-900 p-4 text-sm shadow-inner dark:border-gray-600">
            <pre>{parsedHtml.value}</pre>
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'HTML Parser',
  meta: [
    {
      name: 'description',
      content: 'Parse HTML to Qwik VNode tree',
    },
  ],
};
