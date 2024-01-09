import { type QwikIntrinsicElements } from '@builder.io/qwik';

export function RoutesIcon(props: QwikIntrinsicElements['svg'], key: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
      key={key}
    >
      <g fill="none">
        <path
          stroke="black"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 9a2 2 0 1 0 0-4a2 2 0 0 0 0 4zm0 0v1m0 7v-1m2 3a2 2 0 1 0-4 0a2 2 0 0 0 4 0zm0 0h1m9-2a2 2 0 1 1-2 2m2-2a2 2 0 0 0-2 2m2-2v-1m-2 3h-1"
        ></path>
        <circle cx="5" cy="13" r="1" fill="black"></circle>
        <circle cx="11" cy="19" r="1" fill="black"></circle>
        <path
          stroke="black"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M21 7c0 2.611-4 6-4 6s-4-3.389-4-6s1.79-4 4-4s4 1.389 4 4z"
        ></path>
        <circle cx="17" cy="7" r="1" fill="black"></circle>
      </g>
    </svg>
  );
}
