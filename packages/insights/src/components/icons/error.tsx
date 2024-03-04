import { type QwikIntrinsicElements } from '@builder.io/qwik';

export const ErrorIcon = function MaterialSymbolsChatErrorSharp(
  props: QwikIntrinsicElements['svg'],
  key: string
) {
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
        fill="black"
        d="M2 22V2h20v16H6l-4 4Zm7.4-8l2.6-2.6l2.6 2.6l1.4-1.4l-2.6-2.6L16 7.4L14.6 6L12 8.6L9.4 6L8 7.4l2.6 2.6L8 12.6L9.4 14Z"
      ></path>
    </svg>
  );
};
