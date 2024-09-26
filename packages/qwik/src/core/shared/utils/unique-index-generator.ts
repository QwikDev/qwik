import type { Container } from '../types';

export const intToStr = (nu: number) => {
  return nu.toString(36);
};

export const getNextUniqueIndex = (container: Container) => {
  return intToStr(container.$currentUniqueId$++);
};
