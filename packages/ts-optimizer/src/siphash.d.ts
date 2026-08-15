/**
 * The published `siphash` package ships untyped CommonJS beside same-named `.ts` sources that are
 * plain scripts, so `.js` → `.ts` resolution finds a non-module. Only `hash` is used.
 */
declare module 'siphash/lib/siphash13.js' {
  const SipHash13: {
    hash(key: [number, number, number, number], input: string): { h: number; l: number };
  };
  export default SipHash13;
}
