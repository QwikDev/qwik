/** @file Public types for the SSR */

export interface SSRContainer {
  tag: string;
  writer: StreamWriter;
  textNode(text: string): void;
  openElement(tag: string, attrs: SsrAttrs): void;
  closeElement(): void;
  openContainer(): void;
  closeContainer(): void;
}

export type SsrAttrs = Array<string | null>;
export interface StreamWriter {
  write(chunk: string): void;
}