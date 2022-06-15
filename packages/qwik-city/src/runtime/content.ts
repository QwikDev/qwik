import type { LayoutModule, PageModule } from './types';
import { jsx } from '@builder.io/qwik';

export const createContent = (updatedModules: (PageModule | LayoutModule)[]) => {
  return () => {
    return jsx('p', {
      children: 'content',
    });
  };
};
