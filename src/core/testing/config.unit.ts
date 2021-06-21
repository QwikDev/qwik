import { dirname } from '../util/dirname.js';

export const TEST_CONFIG = {
  baseURI: dirname(import.meta.url),
  protocol: {
    test: '../',
    import: '../import/',
    jsx: '../render/jsx/',
    entity: '../entity/',
    injection: '../injector/',
  },
};
