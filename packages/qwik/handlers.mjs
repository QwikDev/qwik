/**
 * This re-exports the QRL handlers so that they can be used as QRLs.
 *
 * In vite dev mode, this file is referenced directly. This ensures that the correct path to core is
 * used so that there's only one instance of Qwik.
 *
 * Make sure that these handlers are listed in manifest.ts
 */
export { _chk, _rsc, _res, _run, _task, _val } from '@qwik.dev/core';
export {
  _Each_component_useTask_1IvuA9ZneGc as Each_component_useTask_1IvuA9ZneGc,
  _Each_component_zi6m0DQBsr8 as Each_component_zi6m0DQBsr8,
} from '@qwik.dev/core';
