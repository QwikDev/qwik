import { type QwikIntrinsicElements } from '@builder.io/qwik';

export function DashboardIcon(props: QwikIntrinsicElements['svg'], key: string) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      {...props}
      key={key}
    >
      <g
        fill="none"
        stroke="black"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      >
        <path d="M12 4v4M4 8l2.5 2.5m11 0L20 8M3 17h3m6 0l1-6m5 6h3M8.5 20.001H4A9.956 9.956 0 0 1 2 14C2 8.477 6.477 4 12 4s10 4.477 10 10c0 2.252-.744 4.33-2 6.001L15.5 20"></path>
        <path d="M12 23a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z"></path>
      </g>
    </svg>
  );
}
