import { component$, useSignal, useStyles$ } from '@qwik.dev/core';
import { CopyCode as CopyCodeIcon } from '../svgs/copy-code-icon';
import styles from './copy-code.css?inline';

const Check = component$(({ height = 12, width = 12 }: { height?: number; width?: number }) => {
  useStyles$(styles);

  return (
    <svg
      class="w-3.5 h-3.5 text-white "
      height={height}
      width={width}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 16 12"
    >
      <path
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M1 5.917 5.724 10.5 15 1.5"
      />
    </svg>
  );
});
export const CopyCode = component$(({ code }: { code: string }) => {
  const copied = useSignal(false);
  return (
    <button
      preventdefault:click
      onClick$={async (e) => {
        copied.value = !copied.value;
        if (copied.value) {
          setTimeout(() => (copied.value = false), 1500);
        }
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(code);
        }
      }}
      class="absolute text-[--secondary-text-color] right-2 top-2 shadow-2xl z-10"
    >
      <span
        class={{
          animate: true,
          visible: copied.value,
          hidden: !copied.value,
        }}
      >
        <Check />
      </span>
      <span
        class={{
          animate: true,
          visible: !copied.value,
          hidden: copied.value,
        }}
      >
        <CopyCodeIcon />
      </span>
    </button>
  );
});
