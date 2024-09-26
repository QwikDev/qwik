import type { Container2 } from '../types';

export const intToStr = (nu: number) => {
  return nu.toString(36);
};

export const getNextUniqueIndex = (container: Container2) => {
  return intToStr(container.$currentUniqueId$++);
};
