import { type QwikIntrinsicElements } from '@builder.io/qwik';

export function EdgeIcon(props: QwikIntrinsicElements['svg'], key: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
      key={key}
    >
      <path
        fill="none"
        stroke="black"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M18 3a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3M3 18V6a3 3 0 1 1 6 0v12a3 3 0 0 1-6 0zm6-6h8m-3 3l3-3l-3-3"
      ></path>
    </svg>
  );
}
