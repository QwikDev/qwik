/** The compiler package entry: the staged pipeline. The legacy `src/` tree is deleted at cutover. */
export { transformModules } from '../pipeline/transform-modules';
/** @internal */
export { transformModules as transformPipelineModules } from '../pipeline/transform-modules';
/** @internal */
export * as pipeline from '../pipeline';
/** @internal */
export { extractRenderRoots, type ExtractedRenderRoot } from '../pipeline/render-roots';
