/**
 * @license
 * Copyright Builder.io, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/BuilderIO/qwik/blob/main/LICENSE
 */

declare const global: any;
declare const WorkerGlobalScope: any;

const _globalThis = typeof globalThis !== 'undefined' && globalThis;
const _window = typeof window !== 'undefined' && window;
const _self =
  typeof self !== 'undefined' &&
  typeof WorkerGlobalScope !== 'undefined' &&
  self instanceof WorkerGlobalScope &&
  self;
const __global = typeof global !== 'undefined' && global;

const _global = _globalThis || __global || _window || _self;
export default _global as {
  qDev: boolean;
  Q: any;
};
