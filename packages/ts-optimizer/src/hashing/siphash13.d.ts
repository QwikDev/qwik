// Also listed in packages/qwik/tsconfig.json: without it that program resolves the specifier to
// siphash's shipped .ts source, which is a plain script rather than a module.
declare module 'siphash/lib/siphash13.js' {
  const SipHash13: {
    hash(key: [number, number, number, number], message: string): { h: number; l: number };
  };
  export default SipHash13;
}
