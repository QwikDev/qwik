import { getScopedStyles } from '../shared/utils/scoped-stylesheet';
import { ComponentStylesPrefixContent, QStyle, QStyleSelector } from '../shared/utils/markers';
import { getActiveInvokeContext } from './invoke-context';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';

export function useStyles(style: string, styleId: string): string {
  appendStyleContent(styleId, style);
  return styleId;
}

export function useStylesScoped(style: string, styleId: string, registerScope?: true): string {
  const styleIds = getStyleIds();
  if (!styleIds.has(styleId)) {
    appendStyleContent(styleId, getScopedStyles(style, styleId), styleIds);
  }
  const scope = ComponentStylesPrefixContent + styleId;
  if (registerScope) {
    const context = getActiveInvokeContext();
    const scopes = context.styleScopes ?? (context.styleScopes = []);
    if (!scopes.includes(scope)) {
      scopes.push(scope);
    }
  }
  return scope;
}

/** @public */
export const useStyles$: (style: string) => string = /*#__PURE__*/ implicit$FirstArg(
  useStyles as any
);
/** @public */
export const useStylesScoped$: (style: string) => string = /*#__PURE__*/ implicit$FirstArg(
  useStylesScoped as any
);

function getStyleIds(): Map<string, string> {
  const container = getActiveInvokeContext().container;
  const document = container?.document ?? globalThis.document;
  let styleIds = container?.styleIds;
  if (styleIds === undefined) {
    styleIds = new Map<string, string>();
    if (document !== undefined) {
      const styles = document.querySelectorAll(QStyleSelector);
      for (let i = 0; i < styles.length; i++) {
        styleIds.set(styles[i].getAttribute(QStyle)!, styles[i].textContent || '');
      }
    }
    if (container !== undefined) {
      container.styleIds = styleIds;
    }
  }
  return styleIds;
}

function appendStyleContent(styleId: string, content: string, styleIds = getStyleIds()): void {
  const container = getActiveInvokeContext().container;
  const document = container?.document ?? globalThis.document;
  if (styleIds.has(styleId)) {
    return;
  }
  styleIds.set(styleId, content);
  if (document === undefined) {
    return;
  }
  const styleElement = document.createElement('style');
  styleElement.setAttribute(QStyle, styleId);
  styleElement.textContent = content;
  document.head.appendChild(styleElement);
}
