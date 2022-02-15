export const getQuestPage = async (pages, opts) => {
  const pageData = pages.find((p) => p[1] === opts.pathname);
  if (pageData) {
    const page = {
      id: pageData[0],
      pathname: pageData[1],
      title: pageData[2],
      getContent: createGetContent(pageData),
      getAttributes: createGetAttributes(pageData),
      getLayout: createGetLayout(pageData),
    };
    return page;
  }
  return null;
};

const createGetContent = (pageData) => {
  return async () => {
    const mod = await getModule(pageData);
    if (mod && mod.default) {
      return mod.default;
    }
    return null;
  };
};

const createGetAttributes = (pageData) => {
  return async () => {
    const mod = await getModule(pageData);
    const attrs = {};
    if (mod) {
      Object.keys(mod).forEach((k) => {
        if (k !== 'default') {
          attrs[k] = mod[k];
        }
      });
    }
    return attrs;
  };
};

const getModule = (pageData) => {
  if (!pageData[5]) {
    pageData[5] = pageData[3]();
  }
  return pageData[5];
};

const createGetLayout = (pageData) => {
  return async () => {
    pageData[6] = pageData[6] || pageData[4]();
    const mod = await pageData[6];
    if (mod && mod.default) {
      return mod.default;
    }
    return null;
  };
};

export const getQuestNavItems = async (pages, opts = {}) => {
  const navItems = [];
  opts;
  return navItems;
};
