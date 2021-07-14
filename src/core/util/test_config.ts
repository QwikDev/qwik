import { toFileUrl } from '@builder.io/qwik/testing';

export const TEST_CONFIG = {
  baseURI: toFileUrl(__filename),
  protocol: {
    test: '../',
    import: '../import/',
    jsx: '../render/jsx/',
    entity: '../entity/',
    injection: '../injector/',
  },
};
