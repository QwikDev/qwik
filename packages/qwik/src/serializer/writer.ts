export interface SerdesWriter {
  write(chunk: string): void;
  toString(): string;
}
