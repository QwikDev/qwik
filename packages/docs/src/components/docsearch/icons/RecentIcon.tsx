import { component$ } from '@qwik.dev/core';

export const RecentIcon = component$(() => {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <path
        d="M10 10l5.09-5.09L10 10l5.09 5.09L10 10zm0 0L4.91 4.91 10 10l-5.09 5.09L10 10z"
        stroke="currentColor"
        fill="none"
        fill-rule="evenodd"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
});
