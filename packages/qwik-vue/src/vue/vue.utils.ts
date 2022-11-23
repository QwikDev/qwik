import type { VueProps } from './types';

const HYDRATION_STRATEGU_PREFIX = 'client:';
const HOST_PREFIX = 'host:';

export const getAttrs = (attributes: VueProps) => {
  const formattedBindAttributes: Record<string, unknown> = {};

  for (const key in attributes) {
    if (!key.startsWith(HYDRATION_STRATEGU_PREFIX) && !key.startsWith(HOST_PREFIX)) {
      if (key.startsWith('on')) {
        const name = key.replace('$', '');
        formattedBindAttributes[name] = attributes[key];
      } else {
        formattedBindAttributes[key] = attributes[key];
      }
    }
  }

  return formattedBindAttributes;
};

export const getHostProps = (attributes: VueProps) => {
  const formattedBindAttributes: Record<string, any> = {};

  for (const key in attributes) {
    if (key.startsWith(HOST_PREFIX)) {
      const name = key.replace(HOST_PREFIX, '');
      formattedBindAttributes[name] = attributes[key];
    }
  }

  return formattedBindAttributes;
};
