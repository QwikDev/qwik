export const getContents = () => {
  const modules = import.meta.glob('../../../../*.mdx');

  return Object.entries(modules).map(([key, module]) => {
    const content: Content = {
      name: key.toLowerCase().split('/').pop()!.slice(0, -4),
      module: module as any,
    };
    return content;
  });
};

export interface Content {
  name: string;
  module: () => Promise<ContentModule>;
}

export interface ContentModule {
  title?: string;
  layout?: string;
  default: any;
}
