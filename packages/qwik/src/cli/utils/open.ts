import open, { apps } from 'open';
import { note } from './utils';

export const openBrowser = async (url: URL) => {
  note(`🌐 Opening:  ${url}`);

  await open(url.href, {
    app: {
      name: apps.chrome,
    },
  });
};
