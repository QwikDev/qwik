import type { JSXOutput } from '@qwik.dev/core';
// register vitest matchers
import './vdom-diff.unit-util';
import './mocks';

export { createDOM } from './library';
export { expectDOM } from './expect-dom';
export { createDocument } from './document';
export { getTestPlatform } from './platform';
export { domRender, ssrRenderToDom, emulateExecutionOfQwikFuncs } from './rendering.unit-util';
export { walkJSX, vnode_fromJSX } from './vdom-diff.unit-util';
export { trigger, ElementFixture } from './element-fixture';
export { waitForDrain } from './util';

// TODO get api-extractor to export this too
interface CustomMatchers<R = unknown> {
  toMatchVDOM(expectedJSX: JSXOutput, isCsr?: boolean): R;
  toMatchDOM(expectedDOM: JSXOutput): Promise<R>;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
