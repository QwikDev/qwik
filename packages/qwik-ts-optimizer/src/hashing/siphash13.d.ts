declare module 'siphash/lib/siphash13.js' {
  const SipHash13: {
    hash(
      key: [number, number, number, number],
      message: string
    ): { h: number; l: number };
  };
  export default SipHash13;
}
