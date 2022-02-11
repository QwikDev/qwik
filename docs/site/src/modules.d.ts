declare module '*.module.css' {
  const classNames: Record<string, string>;
  export default classNames;
}

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

declare module '*.md' {
  // "unknown" would be more detailed depends on how you structure frontmatter
  const attributes: Record<string, unknown>;

  // When "Mode.TOC" is requested
  const toc: { level: string; content: string }[];

  // When "Mode.HTML" is requested
  const html: string;

  // Modify below per your usage
  export { attributes, toc, html };
}
