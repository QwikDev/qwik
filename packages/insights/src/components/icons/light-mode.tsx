import type { QwikIntrinsicElements } from '@builder.io/qwik';

export function LightModeIcon(props: QwikIntrinsicElements['svg'], key: string) {
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
        fill="currentColor"
        d="M12 17q-2.075 0-3.538-1.463T7 12q0-2.075 1.463-3.538T12 7q2.075 0 3.538 1.463T17 12q0 2.075-1.463 3.538T12 17ZM1 13v-2h4v2H1Zm18 0v-2h4v2h-4Zm-8-8V1h2v4h-2Zm0 18v-4h2v4h-2ZM6.35 7.75L3.875 5.275l1.4-1.4L7.75 6.35l-1.4 1.4Zm12.375 12.375L16.25 17.65l1.4-1.4l2.475 2.475l-1.4 1.4ZM17.65 7.75l-1.4-1.4l2.475-2.475l1.4 1.4L17.65 7.75ZM5.275 20.125l-1.4-1.4L6.35 16.25l1.4 1.4l-2.475 2.475Z"
      ></path>
    </svg>
  );
}
export default LightModeIcon;
