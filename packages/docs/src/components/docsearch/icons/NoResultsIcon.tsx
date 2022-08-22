import { component$ } from '@builder.io/qwik';

export const NoResultsIcon = component$(() => {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 20 20"
      fill="none"
      fill-rule="evenodd"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M15.5 4.8c2 3 1.7 7-1 9.7h0l4.3 4.3-4.3-4.3a7.8 7.8 0 01-9.8 1m-2.2-2.2A7.8 7.8 0 0113.2 2.4M2 18L18 2"></path>
    </svg>
  );
});
