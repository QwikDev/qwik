/**
 * What the optimizer's output for core's own sources imports from `@qwik.dev/core`. Core's build
 * and the unit tests resolve that import here, because core's barrel would import those files
 * back.
 */
export { inlinedQrl } from './library-qrl';
export { _noopQrl, _noopQrlDEV, _regSymbol, inlinedQrlDEV, qrl, qrlDEV } from './qrl';
export { _capturesObj } from './qrl-class';
