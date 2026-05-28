import type { Container } from '../types';
import { getRootContainer } from './container';

export const intToStr = (nu: number) => {
  return nu.toString(36);
};

export const getNextUniqueIndex = (container: Container) => {
  const rootContainer = getRootContainer(container);
  return intToStr(rootContainer.$currentUniqueId$++);
};
