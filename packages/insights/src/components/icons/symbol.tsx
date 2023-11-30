import { type QwikIntrinsicElements } from '@builder.io/qwik';

export const SymbolIcon = function MaterialSymbolsFunction(
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
        d="M10 18v-2h1.55l2.625-3l-2.625-3H9.9l-1.6 8.6q-.2 1.125-.925 1.763T5.525 21Q4.4 21 3.7 20.4T3 18.8q0-.8.425-1.288t1.075-.487q.625 0 1.063.425T6 18.475q0 .125-.013.225t-.037.225q.125-.025.213-.138t.137-.312L7.85 10H5V8h3.225l.525-2.85q.175-.95.938-1.55T11.5 3q1.1 0 1.8.65t.7 1.625q0 .75-.425 1.238T12.5 7q-.625 0-1.063-.425T11 5.525q0-.125.013-.225t.037-.225q-.15.05-.225.15t-.125.3L10.275 8H15v2h-.8l1.3 1.475L16.8 10H16V8h5v2h-1.55l-2.625 3l2.625 3H21v2h-5v-2h.8l-1.3-1.5l-1.3 1.5h.8v2h-5Z"
      ></path>
    </svg>
  );
};
