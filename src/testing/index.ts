import type { QwikGlobal } from '../core/util/global';
(globalThis as any as QwikGlobal).qDev = true;

export { applyDocumentConfig } from './config';
export { createDocument, createGlobal } from './global';
export { ComponentFixture } from './component_fixture';
export { ElementFixture } from './element_fixture';
export { getPlatform, setPlatform, resetPlatform } from './platform';
export type {
  MockDocument,
  MockGlobal,
  MockHTMLElement,
  MockHTMLInputElement,
  MockRequestAnimationFrame,
} from './types';
export { isPromise, toFileUrl } from './util';
