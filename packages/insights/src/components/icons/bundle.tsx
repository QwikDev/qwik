import { type QwikIntrinsicElements } from '@builder.io/qwik';

export function BundleIcon(props: QwikIntrinsicElements['svg'], key: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 36 36"
      {...props}
      key={key}
    >
      <path
        fill="black"
        d="m32.43 8.35l-13-6.21a1 1 0 0 0-.87 0l-15 7.24a1 1 0 0 0-.57.9v16.55a1 1 0 0 0 .6.92l13 6.19a1 1 0 0 0 .87 0l15-7.24a1 1 0 0 0 .57-.9V9.25a1 1 0 0 0-.6-.9ZM19 4.15l10.93 5.22l-5.05 2.44l-10.67-5.35Zm-2 11.49L6 10.41l5.9-2.85l10.7 5.35ZM5 12.13l11 5.27v14.06L5 26.2Zm13 19.32V17.36l13-6.29v14.1Z"
        class="clr-i-outline clr-i-outline-path-1"
      ></path>
      <path fill="none" d="M0 0h36v36H0z"></path>
    </svg>
  );
}
