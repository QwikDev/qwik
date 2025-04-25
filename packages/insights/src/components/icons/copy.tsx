import { component$, useSignal, type QRL, useStylesScoped$ } from '@builder.io/qwik';

interface CopyIconProps {
  class?: string;
  onClick$: QRL<() => void>;
}

export const CopyIcon = component$<CopyIconProps>(({ onClick$, ...props }) => {
  useStylesScoped$(`
    .wrapper {
      display: flex;
    }
  `);
  const copiedSig = useSignal(false);

  return (
    <span
      class="wrapper"
      preventdefault:click
      onClick$={() => {
        onClick$();
        copiedSig.value = true;
        setTimeout(() => (copiedSig.value = false), 2000);
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1rem"
        height="1rem"
        viewBox="0 0 24 24"
        aria-hidden="true"
        preventdefault:click
        {...props}
      >
        <path
          fill="currentColor"
          d="M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12V1Z"
        ></path>
      </svg>
      &nbsp;{copiedSig.value ? 'Copied' : 'Copy'}
    </span>
  );
});
