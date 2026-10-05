import { component$ } from '@qwik.dev/core';

interface SunIconProps {
  class?: string;
}

export const SunIcon = component$<SunIconProps>(
  ({ class: className, ...props }) => {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.6"
        stroke="currentColor"
        class={className}
        {...props}
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 2V4M12 20V22M4.92993 4.92993L6.33993 6.33993M17.6599 17.6599L19.0699 19.0699M2 12H4M20 12H22M6.33993 17.6599L4.92993 19.0699M19.0699 4.92993L17.6599 6.33993M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z"
        />
      </svg>
    );
  }
);
