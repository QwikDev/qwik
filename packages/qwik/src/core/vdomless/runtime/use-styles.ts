import { getScopedStyles } from '../../shared/utils/scoped-stylesheet';
import { ComponentStylesPrefixContent, QStyle, QStyleSelector } from '../../shared/utils/markers';
import { getActiveInvokeContext } from './invoke-context';

export function appendStyle(style: string, styleId: string): string {
  appendStyleContent(styleId, style);
  return styleId;
}

export function appendScopedStyle(style: string, styleId: string): string {
  appendStyleContent(styleId, getScopedStyles(style, styleId));
  return ComponentStylesPrefixContent + styleId;
}

function appendStyleContent(styleId: string, content: string): void {
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
