import { componentQrl, inlinedQrl } from '@qwik.dev/core';

function useUnused() {
  return /*#__PURE__*/ inlinedQrl(() => 'UNUSED_CALLBACK', 'useUnused_callback_AAA111aaa11');
}

export const Unused = /*#__PURE__*/ componentQrl(
  /*#__PURE__*/ inlinedQrl(() => {
    useUnused();
    return null;
  }, 'Unused_component_BBB222bbb22')
);

function useRead() {
  const read = /*#__PURE__*/ inlinedQrl(() => 'LIVE_READ', 'useRead_read_CCC333ccc33');
  return read();
}

export const App = /*#__PURE__*/ componentQrl(
  /*#__PURE__*/ inlinedQrl(() => useRead(), 'App_component_DDD444ddd44')
);

console.log('KEEP_SIDE_EFFECT');
