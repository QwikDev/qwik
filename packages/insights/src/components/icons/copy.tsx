import { component$, useSignal, type PropFunction } from '@builder.io/qwik';

interface CopyIconProps {
  class: string;
  onClick$: PropFunction<() => void>;
}

export const CopyIcon = component$<CopyIconProps>(({ onClick$, ...props }) => {
  const copiedSig = useSignal(false);

  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="1em"
        height="1em"
        viewBox="0 0 24 24"
        aria-hidden="true"
        preventdefault:click
        onClick$={() => {
          onClick$();
          copiedSig.value = true;
          setTimeout(() => (copiedSig.value = false), 2000);
        }}
        {...props}
      >
        <path
          fill="currentColor"
          d="M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12V1Z"
        ></path>
      </svg>
      {copiedSig.value ? 'Copied' : 'Copy'}
    </>
  );
});
