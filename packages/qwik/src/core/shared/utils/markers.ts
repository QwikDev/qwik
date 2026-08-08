/** State factory of the component. */

/** Target DOM element for external projection rendering. */

/** Component style content prefix */
export const ComponentStylesPrefixContent = '⚡️';

/** `<some-element q:slot="...">` */
export const QStyle = 'q:style';
export const QStyleSelector = 'style[q\\:style]';
export const QStyleSSelector = 'style[q\\:sstyle]';
export const QFuncsPrefix = 'qFuncs_';
export const QwikEvContainerReady = 0;

export const getQFuncs = (
  document: Document,
  hash: string
): Record<string, (...args: unknown[]) => unknown> => {
  return (document as any)[QFuncsPrefix + hash] || {};
};

export const QRenderAttr = 'q:render';
export const QRuntimeAttr = 'q:runtime';
export const QVersionAttr = 'q:version';
export const QBaseAttr = 'q:base';
export const QLocaleAttr = 'q:locale';
export const QManifestHashAttr = 'q:manifest-hash';
export const QInstanceAttr = 'q:instance';
export const QContainerIsland = 'q:container-island';
export const QIgnore = 'q:ignore';
export const QContainerAttr = 'q:container';

// the same selector should be inside the qwik loader
// and the same selector should be inside the qwik router spa-shim and spa-init
export const QContainerSelector =
  '[q\\:container]:not([q\\:container=' + 'html' + ']):not([q\\:container=' + 'text' + '])';

// Node namespaces
export const HTML_NS = 'http://www.w3.org/1999/xhtml';
export const SVG_NS = 'http://www.w3.org/2000/svg';
export const MATH_NS = 'http://www.w3.org/1998/Math/MathML';

export const RenderEvent = 'qRender';

/** `<q:slot name="...">` */

/**
 * Attribute to mark that this VNode has a pointer to itself from the `qwik/json` state.
 *
 * As the VNode get materialized the vnode now becomes eligible for mutation. Once the vnode mutates
 * the `VNode` references from the `qwik/json` may become invalid. For this reason, these references
 * need to be eagerly resolved. `VNODE_REF` stores a pointer to "this" vnode. This allows the system
 * to eagerly resolve these pointes as the vnodes are materialized.
 */
export const ELEMENT_ID = 'q:id';
/** @internal */

export const dangerouslySetInnerHTML = 'dangerouslySetInnerHTML';
