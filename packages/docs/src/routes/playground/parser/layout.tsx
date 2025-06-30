import { component$, useSignal, Slot } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';

export default component$(() => {
  const location = useLocation();
  const selectedTab = useSignal(location.url.pathname.includes('/html') ? 'html' : 'state');

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
              Code Parser
            </h1>
          </div>
          <p class="max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-300">
            Transform your code data into beautifully formatted and syntax-highlighted output
          </p>
        </div>

        {/* Navigation Links */}
        <div class="flex justify-center mb-8">
          <div class="gap-1 inline-flex space-x-0.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl p-0.5 shadow-lg border border-white/20 dark:border-gray-700">
            <a
              href="/playground/parser/state"
              class={`px-2 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                selectedTab.value === 'state'
                  ? 'bg-blue-500 text-gray-900 shadow-md'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span class="flex items-center gap-1.5">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                State Parser
              </span>
            </a>
            <a
              href="/playground/parser/html"
              class={`px-2 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                selectedTab.value === 'html'
                  ? 'bg-green-500 text-gray-900 shadow-md'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <span class="flex items-center gap-1.5">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                HTML Parser
              </span>
            </a>
          </div>
        </div>

        {/* Content Area */}
        <div class="mt-6">
          <Slot />
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
              Perfect for debugging Qwik applications and analyzing code structure
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
