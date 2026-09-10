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
export type {
  InOrderAuto,
  InOrderDisabled,
  InOrderDirect,
  InOrderStreaming,
  OutOfOrderStreaming,
  StreamingOptions,
} from '../server/types';

declare module 'vitest' {
  interface Matchers<R, T> {
    toMatchVDOM(expectedJSX: JSXOutput, isCsr?: boolean): R;
    toMatchDOM(expectedDOM: JSXOutput): Promise<void>;
  }
}
