declare module '*?jsx' {
  const Cmp: import('./packages/qwik/').FunctionComponent<
    Omit<
      import('./packages/qwik/').QwikIntrinsicElements['img'],
      'src' | 'width' | 'height' | 'srcSet'
    >
  >;
  export default Cmp;
  export const width: number;
  export const height: number;
  export const srcSet: string;
}
