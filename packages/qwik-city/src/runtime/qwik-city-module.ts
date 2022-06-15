import type { QwikManifest } from '@builder.io/qwik/optimizer';
import type { RouteData, Menu, Layout } from './types';

export const routes: RouteData[] = [];
export const layouts: { [pathName: string]: () => Promise<Layout> } = {};
export const menus: { [pathName: string]: Menu } = {};
export const buildId = '';
export const manifest: QwikManifest = { symbols: {}, mapping: {}, bundles: {}, version: '' };
