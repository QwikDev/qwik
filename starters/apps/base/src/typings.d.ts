/* Allows Typescript to import .css files */
declare module '*.css' {
  const content: string;
  export default content;
}

/* Allows Typescript to import .svg files */
declare module '*.svg' {
  const content: string;
  export default content;
}
