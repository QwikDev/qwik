import { type QwikIntrinsicElements } from '@builder.io/qwik';

export function DiskIcon(props: QwikIntrinsicElements['svg'], key: string) {
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
        d="M5 21q-.825 0-1.413-.588T3 19V5q0-.825.588-1.413T5 3h11.175q.4 0 .763.15t.637.425l2.85 2.85q.275.275.425.638t.15.762V19q0 .825-.588 1.413T19 21H5ZM19 7.85L16.15 5H5v14h14V7.85ZM12 18q1.25 0 2.125-.875T15 15q0-1.25-.875-2.125T12 12q-1.25 0-2.125.875T9 15q0 1.25.875 2.125T12 18Zm-5-8h7q.425 0 .713-.288T15 9V7q0-.425-.288-.713T14 6H7q-.425 0-.713.288T6 7v2q0 .425.288.713T7 10ZM5 7.85V19V5v2.85Z"
      ></path>
    </svg>
  );
}
