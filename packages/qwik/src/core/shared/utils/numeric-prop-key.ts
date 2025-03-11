import type { KnownEventNames } from '../jsx/types/jsx-qwik-events';
import {
  createEventName,
  isHtmlAttributeAnEventName,
  isJsxPropertyAnEventName,
  parseEventNameFromIndex,
} from './event-names';
import {
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  HANDLER_PREFIX,
  NON_SERIALIZABLE_MARKER_PREFIX,
  Q_PREFIX,
  dangerouslySetInnerHTML,
  refAttr,
  OnRenderProp,
  QSlotParent,
  QCtxAttr,
  QSlot,
  QScopedStyle,
  ELEMENT_SEQ,
  ELEMENT_SEQ_IDX,
  QBackRefs,
  USE_ON_LOCAL_SEQ_IDX,
  USE_ON_LOCAL,
  USE_ON_LOCAL_FLAGS,
} from './markers';
import { NumericFlagsShift, NumericPropKeyFlags } from './numeric-prop-key-flags';

const propNameToId = new Map<string | symbol, NumericPropKey>();
const idToPropName: (string | symbol)[] = [];
export type NumericPropKey = number & { __brand__: 'NumericPropKey' };

const colonOnLength = ':on'.length;

export const getPropId = (name: string | symbol): NumericPropKey => {
  let id = propNameToId.get(name);
  if (id != null) {
    return id;
  }
  id = (idToPropName.length << NumericFlagsShift) as NumericPropKey;
  if (typeof name === 'string') {
    if (isJsxPropertyAnEventName(name)) {
      name = normalizeEvent(name);
      (id as number) |= NumericPropKeyFlags.EVENT;
    } else if (isHtmlAttributeAnEventName(name)) {
      (id as number) |= NumericPropKeyFlags.EVENT;
    } else if (name.startsWith(Q_PREFIX)) {
      (id as number) |= NumericPropKeyFlags.Q_PREFIX;
    } else if (name.startsWith(HANDLER_PREFIX)) {
      (id as number) |= NumericPropKeyFlags.START_WITH_COLON;
    }

    if (!name.startsWith(Q_PREFIX) && !name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      (id as number) |= NumericPropKeyFlags.SLOT;
    }
  }
  idToPropName.push(name);
  propNameToId.set(name, id);
  return id;
};

export const StaticPropId = {
  // ELEMENT_KEY should be always first, because of `getKey` in vnode_diff.ts
  ELEMENT_KEY: getPropId(ELEMENT_KEY),
  ELEMENT_ID: getPropId(ELEMENT_ID),
  ELEMENT_PROPS: getPropId(ELEMENT_PROPS),
  REF: getPropId(refAttr),
  INNER_HTML: getPropId(dangerouslySetInnerHTML),
  VALUE: getPropId('value'),
  ON_RENDER: getPropId(OnRenderProp),
  CLASS: getPropId('class'),
  CLASS_NAME: getPropId('classname'),
  SLOT: getPropId(QSlot),
  SLOT_PARENT: getPropId(QSlotParent),
  CTX: getPropId(QCtxAttr),
  SCOPED_STYLE: getPropId(QScopedStyle),
  ELEMENT_SEQ: getPropId(ELEMENT_SEQ),
  ELEMENT_SEQ_IDX: getPropId(ELEMENT_SEQ_IDX),
  BACK_REFS: getPropId(QBackRefs),
  USE_ON_LOCAL_SEQ_IDX: getPropId(USE_ON_LOCAL_SEQ_IDX),
  USE_ON_LOCAL: getPropId(USE_ON_LOCAL),
  USE_ON_LOCAL_FLAGS: getPropId(USE_ON_LOCAL_FLAGS),
  CHILDREN: getPropId('children'),
};

export const getPropName = <T extends string>(id: NumericPropKey): T => {
  return idToPropName[id >> NumericFlagsShift] as T;
};

function normalizeEvent(name: string): string {
  const index = name.indexOf(':on');
  const scope = (name.substring(0, index) || undefined) as 'window' | 'document' | undefined;
  const eventName = parseEventNameFromIndex(name, index + colonOnLength);
  name = createEventName(eventName, scope) as KnownEventNames;
  return name;
}
