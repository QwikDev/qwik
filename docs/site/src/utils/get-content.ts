export const getLayout = async (layoutName?: string) => {
  const layouts = getLayouts();

  const layoutModule =
    layouts.find((l) => l.name === layoutName) ?? layouts.find((l) => l.name === 'docs');

  const Layout = (await layoutModule?.module())?.default;

  return Layout;
};

const getLayouts = () => {
  const modules = import.meta.glob('../layouts/**/*.tsx');

  return Object.entries(modules).map(([key, module]) => {
    const content: Content = {
      name: key.toLowerCase().split('/').pop()!.slice(0, -4),
      module: module as any,
    };
    return content;
  });
};

export const getContents = () => {
  const modules = import.meta.glob('../../../*.mdx');

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
