import { component$, useSignal, Slot } from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';

export default component$(() => {
  const location = useLocation();
  const selectedTab = useSignal(location.url.pathname.includes('/html') ? 'html' : 'state');

  return (
    <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 dark:from-gray-900 dark:to-slate-800">
      <div class="mx-auto max-w-7xl">
        {/* Header with improved styling */}
        <div class="mb-8 text-center">
          <div class="mb-4 inline-flex items-center gap-3">
            <div class="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-purple-600">
              <svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <h1 class="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-4xl font-bold text-transparent dark:from-white dark:to-gray-300">
              Code Parser
            </h1>
          </div>
          <p class="mx-auto max-w-2xl text-lg text-gray-600 dark:text-gray-300">
            Transform your code data into beautifully formatted and syntax-highlighted output
          </p>
        </div>

        {/* Navigation Links */}
        <div class="mb-8 flex justify-center">
          <div class="inline-flex gap-1 space-x-0.5 rounded-xl border border-white/20 bg-white/80 p-0.5 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/80">
            <a
              href="/playground/parser/state"
              class={`rounded-lg px-2 py-2 text-sm font-medium transition-all duration-200 ${
                selectedTab.value === 'state'
                  ? 'bg-blue-500 text-gray-900 shadow-md'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <span class="flex items-center gap-1.5">
                <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              class={`rounded-lg px-2 py-2 text-sm font-medium transition-all duration-200 ${
                selectedTab.value === 'html'
                  ? 'bg-green-500 text-gray-900 shadow-md'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <span class="flex items-center gap-1.5">
                <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/60 px-4 py-2 backdrop-blur-sm dark:border-gray-600 dark:bg-gray-800/60">
            <svg
              class="h-4 w-4 text-blue-500"
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
