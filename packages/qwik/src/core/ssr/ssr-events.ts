import { _run } from '../client/run-qrl';
import { createQRL, type QRLInternal } from '../shared/qrl/qrl-class';
import { isQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import { qrlToString } from '../shared/serdes/qrl-to-string';
import type { SerializationContext } from '../shared/serdes/serialization-context';
import { getEventDataFromHtmlAttribute, getScopedEventName } from '../shared/utils/event-names';

/** @internal */
export function setEvent(
  serializationCtx: SerializationContext,
  key: string,
  rawValue: unknown,
  isLoopElement: boolean
): string | null {
  let value: string | null = null;
  const qrls = rawValue;

  const appendToValue = (valueToAppend: string) => {
    value = (value == null ? '' : value + '|') + valueToAppend;
  };
  const getQrlString = (qrl: QRLInternal<unknown>) => {
    /**
     * If there are captures we need to schedule so everything is executed in the right order + qrls
     * are resolved.
     *
     * For internal qrls (starting with `_`) we assume that they do the right thing.
     */
    if (!qrl.$symbol$.startsWith('_') && (qrl.$captures$?.length || isLoopElement)) {
      qrl = createQRL(null, '_run', _run, null, [qrl]);
    }
    return qrlToString(serializationCtx, qrl);
  };

  if (Array.isArray(qrls)) {
    for (let i = 0; i < qrls.length; i++) {
      const qrl: unknown = qrls[i];
      if (isQrl(qrl)) {
        appendToValue(getQrlString(qrl));
        addQwikEventToSerializationContext(serializationCtx, key, qrl);
      } else if (qrl != null) {
        // nested arrays etc.
        const nestedValue = setEvent(serializationCtx, key, qrl, isLoopElement);
        if (nestedValue) {
          appendToValue(nestedValue);
        }
      }
    }
  } else if (isQrl(qrls)) {
    value = getQrlString(qrls);
    addQwikEventToSerializationContext(serializationCtx, key, qrls);
  }

  return value;
}

function addQwikEventToSerializationContext(
  serializationCtx: SerializationContext,
  key: string,
  qrl: QRL
) {
  const data = getEventDataFromHtmlAttribute(key);
  if (data) {
    const [scope, eventName] = data;
    const scopedEvent = getScopedEventName(scope, eventName);
    serializationCtx.$eventNames$.add(scopedEvent);
    serializationCtx.$eventQrls$.add(qrl);
  }
}
