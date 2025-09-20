import { component$, type QwikIntrinsicElements } from '@builder.io/qwik';

interface BrillianceIconProps {
  class?: string;
}

export const BrillianceIcon = component$<BrillianceIconProps>(({ class: className, ...props }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="currentColor"
      class={className}
      viewBox="0 0 16 16"
      {...props}
    >
      <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16M1 8a7 7 0 0 0 7 7 3.5 3.5 0 1 0 0-7 3.5 3.5 0 1 1 0-7 7 7 0 0 0-7 7" />
    </svg>
  );
});
