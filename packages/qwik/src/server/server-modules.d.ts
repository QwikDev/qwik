declare module '@qwik-client-manifest' {
  const manifest: import('./index').QwikManifest;
  export { manifest };
}

declare module '@qwik-client-mapping' {
  const mapping: Record<string, string>;
  export default mapping;
}
