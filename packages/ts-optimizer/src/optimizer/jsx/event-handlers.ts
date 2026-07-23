import type { JSXAttributeItem } from '../../ast-types.js';
import { getJsxAttributeName } from './jsx-attr-name.js';

export function isEventProp(propName: string): boolean {
  if (!propName.endsWith('$')) return false;

  if (propName.startsWith('document:on')) return true;
  if (propName.startsWith('window:on')) return true;
  if (propName.startsWith('host:on')) return true;

  if (propName.startsWith('on') && propName.length > 3) {
    const charAfterOn = propName[2];
    return charAfterOn === '-' || (charAfterOn >= 'A' && charAfterOn <= 'Z');
  }

  return false;
}

export function isPassiveDirective(propName: string): boolean {
  return propName.startsWith('passive:');
}

function createEventName(name: string): string {
  let result = '';
  for (const ch of name) {
    if ((ch >= 'A' && ch <= 'Z') || ch === '-') {
      result += '-';
      result += ch.toLowerCase();
    } else {
      result += ch;
    }
  }
  return result;
}

function normalizeJsxEventName(name: string): string {
  if (name === 'DOMContentLoaded') {
    return '-d-o-m-content-loaded';
  }

  const processedName = name.startsWith('-') ? name.slice(1) : name.toLowerCase();

  return createEventName(processedName);
}

function getEventScopeData(
  propName: string,
  isPassive: boolean
): [prefix: string, stripIndex: number] | null {
  if (propName.startsWith('window:on')) {
    return [isPassive ? 'q-wp:' : 'q-w:', 9];
  }
  if (propName.startsWith('document:on')) {
    return [isPassive ? 'q-dp:' : 'q-d:', 11];
  }
  if (propName.startsWith('on')) {
    return [isPassive ? 'q-ep:' : 'q-e:', 2];
  }
  return null;
}

export function transformEventPropName(
  propName: string,
  passiveEvents: Set<string>
): string | null {
  if (!propName.endsWith('$')) return null;
  if (propName.startsWith('host:')) return null;

  const scopeData = getEventScopeData(propName, false);
  if (!scopeData) return null;

  const [, stripIndex] = scopeData;
  const eventNameRaw = propName.slice(stripIndex, propName.length - 1);
  const normalizedName = normalizeJsxEventName(eventNameRaw);

  const isPassive = passiveEvents.has(normalizedName);
  const [prefix] = getEventScopeData(propName, isPassive)!;

  return prefix + normalizedName;
}

/**
 * The prop name an extracted event-handler call site is rewritten to. Component-element events keep
 * the author-form name (the runtime resolves component props itself); HTML events get the
 * serialized `q-*:` form. The inline/hoist path passes an empty `passiveEvents` set — passive
 * detection runs only on the segment-codegen path (deliberate delta, see `buildNestedCallSites`).
 */
export function eventHandlerPropName(
  rawName: string,
  isComponentEvent: boolean,
  passiveEvents: Set<string>
): string {
  if (isComponentEvent) return rawName;
  return transformEventPropName(rawName, passiveEvents) ?? rawName;
}

export function collectPassiveDirectives(attributes: readonly JSXAttributeItem[]): Set<string> {
  const passiveEvents = new Set<string>();

  for (const attr of attributes) {
    if (attr.type !== 'JSXAttribute') continue;

    const name = getJsxAttributeName(attr);

    if (!isPassiveDirective(name)) continue;

    const rawEventName = name.slice('passive:'.length);
    passiveEvents.add(normalizeJsxEventName(rawEventName));
  }

  return passiveEvents;
}
