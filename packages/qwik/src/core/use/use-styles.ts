import { type QRL } from '../shared/qrl/qrl.public';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { getScopedStyles } from '../shared/utils/scoped-stylesheet';
import { useSequentialScope } from './use-sequential-scope';
import { assertQrl } from '../shared/qrl/qrl-utils';
import { ComponentStylesPrefixContent } from '../shared/utils/markers';
import { styleKey } from '../shared/utils/styles';

/** @public */
export interface UseStylesScoped {
  scopeId: string;
}

/** @public */
export interface UseStyles {
  styleId: string;
}

/** @internal */
export const useStylesQrl = (styles: QRL<string>): UseStyles => {
  return {
    styleId: _useStyles(styles, (str) => str, false),
  };
};

// <docs markdown="../readme.md#useStyles">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useStyles instead and run `pnpm docs.sync`)
/**
 * A lazy-loadable reference to a component's styles.
 *
 * Component styles allow Qwik to lazy load the style information for the component only when
 * needed. (And avoid double loading it in case of SSR hydration.)
 *
 * ```tsx
 * import styles from './code-block.css?inline';
 *
 * export const CmpStyles = component$(() => {
 *   useStyles$(styles);
 *
 *   return <div>Some text</div>;
 * });
 * ```
 *
 * @public
 * @see `useStylesScoped`
 */
// </docs>
export const useStyles$ = /*#__PURE__*/ implicit$FirstArg(useStylesQrl);

/** @internal */
export const useStylesScopedQrl = (styles: QRL<string>): UseStylesScoped => {
  return {
    scopeId: ComponentStylesPrefixContent + _useStyles(styles, getScopedStyles, true),
  };
};

// <docs markdown="../readme.md#useStylesScoped">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useStylesScoped instead and run `pnpm docs.sync`)
/**
 * A lazy-loadable reference to a component's styles, that is scoped to the component.
 *
 * Component styles allow Qwik to lazy load the style information for the component only when
 * needed. (And avoid double loading it in case of SSR hydration.)
 *
 * ```tsx
 * import scoped from './code-block.css?inline';
 *
 * export const CmpScopedStyles = component$(() => {
 *   useStylesScoped$(scoped);
 *
 *   return <div>Some text</div>;
 * });
 * ```
 *
 * @public
 * @see `useStyles`
 */
// </docs>
export const useStylesScoped$ = /*#__PURE__*/ implicit$FirstArg(useStylesScopedQrl);

const _useStyles = (
  styleQrl: QRL<string>,
  transform: (str: string, styleId: string) => string,
  scoped: boolean
): string => {
  assertQrl(styleQrl);

  const { val, set, iCtx, i } = useSequentialScope<string>();
  if (val) {
    return val;
  }
  const styleId = styleKey(styleQrl, i);
  const host = iCtx.$hostElement$;
  set(styleId);

  if (styleQrl.resolved) {
    iCtx.$container$.$appendStyle$(transform(styleQrl.resolved, styleId), styleId, host, scoped);
  } else {
    throw styleQrl
      .resolve()
      .then((val) =>
        iCtx.$container$.$appendStyle$(transform(val, styleId), styleId, host, scoped)
      );
  }

  return styleId;
};
