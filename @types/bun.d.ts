declare const Bun: {
  fileURLToPath: (url: string) => string;
  env: any;
  file: (path: string) => {
    text: () => Promise<string>;
    stream: () => Promise<ReadableStream<Uint8Array>>;
  };
};
