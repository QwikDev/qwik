export { createDocument, createGlobal } from './document';
export { ComponentFixture } from './component_fixture';
export { ElementFixture } from './element_fixture';
export { getTestPlatform } from './platform';
export type { MockDocumentOptions, MockGlobalOptions, MockDocument, MockGlobal } from './types';
export { isPromise, toFileUrl } from './util';
export { applyDocumentConfig, serializeState } from '@builder.io/qwik/server';
