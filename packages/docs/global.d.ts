// handled by raw-source plugin in vite.repl-apps.ts
declare module '*?raw-source' {
  const url: string;
  export default url;
}

declare module '*?compiled-string' {
  const str: string;
  export default str;
}
