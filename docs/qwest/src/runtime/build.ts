import type { PageIndex } from './types';

export const PAGES: { [pathName: string]: () => Promise<any> } = {};
export const INDEXES: { [pathName: string]: PageIndex } = {};
export const LAYOUTS: { [pathName: string]: () => Promise<any> } = {};
export const INLINED_MODULES = true;
export const BUILD_ID = '';
