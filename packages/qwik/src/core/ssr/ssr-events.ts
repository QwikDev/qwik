import type { QRLInternal } from '../shared/qrl/qrl-class';
import { readsOwnCaptures, runQrl, taskQrl, toCoreHandlerQrl } from '../shared/qrl/handler-qrls';
import { isQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import { qrlToChunks } from '../shared/serdes/qrl-to-string';
import { isTask } from '../use/use-task';
import type { SerializationContext } from '../../serializer/serialization-context';
import { getEventDataFromHtmlAttribute, getScopedEventName } from '../shared/utils/event-names';
import type { SSRWriteChunk } from './ssr-types';

/** @internal */
export function setEvent(
  serializationCtx: SerializationContext,
  key: string,
  rawValue: unknown,
  hasMovedCaptures: boolean
): string | SSRWriteChunk[] | null {
  let value: string | SSRWriteChunk[] | null = null;
  const qrls = rawValue;

  const appendToValue = (valueToAppend: string | SSRWriteChunk[]) => {
    if (value == null) {
      value = valueToAppend;
    } else if (typeof value === 'string' && typeof valueToAppend === 'string') {
      value += '|' + valueToAppend;
    } else {
      value = [
        ...(typeof value === 'string' ? [value] : value),
        '|',
        ...(typeof valueToAppend === 'string' ? [valueToAppend] : valueToAppend),
      ];
    }
  };
  const rememberCoreHandler = (qrl: QRLInternal<unknown>) => {
    if (!serializationCtx.$coreHandlerQrls$.has(qrl.$hash$)) {
      serializationCtx.$coreHandlerQrls$.set(qrl.$hash$, qrl);
    }
  };
  const getQrlString = (qrl: QRLInternal<unknown>) => {
    /**
     * If there are captures we need to schedule so everything is executed in the right order + qrls
     * are resolved.
     *
     * Internal qrls (starting with `_`) and core's own handlers deserialize their own captures.
     */
    if (
      !qrl.$symbol$.startsWith('_') &&
      !readsOwnCaptures(qrl) &&
      (Array.isArray(qrl.$captures$) || (hasMovedCaptures && qrl.$hasMovedCaptures$))
    ) {
      // The preloader needs `_run`'s bundle too: qwikloader imports it with the handler's.
      serializationCtx.$eventQrls$.add(runQrl());
      rememberCoreHandler(runQrl());
      // Listing the handler chunk lets qwikloader import it with core instead of after it
      return qrlToChunks(serializationCtx, runQrl().w([qrl]), qrl);
    }
    return qrlToChunks(serializationCtx, qrl);
  };
  const appendQrl = (qrl: QRLInternal<unknown>) => {
    // The optimizer's `bind:` handlers serialize and preload as core's own.
    qrl = toCoreHandlerQrl(qrl);
    if (readsOwnCaptures(qrl)) {
      rememberCoreHandler(qrl);
    }
    appendToValue(getQrlString(qrl));
    addQwikEventToSerializationContext(serializationCtx, key, qrl);
  };

  if (Array.isArray(qrls)) {
    for (let i = 0; i < qrls.length; i++) {
      const qrl: unknown = qrls[i];
      if (isQrl(qrl)) {
        appendQrl(qrl);
      } else if (qrl != null) {
        // nested arrays etc.
        const nestedValue = setEvent(serializationCtx, key, qrl, hasMovedCaptures);
        if (nestedValue) {
          appendToValue(nestedValue);
        }
      }
    }
  } else if (isQrl(qrls)) {
    appendQrl(qrls);
  }

  return value;
}

function getCapturedTask(qrl: QRLInternal<unknown>) {
  const captures = qrl.$captures$;
  if (!Array.isArray(captures) || qrl.$hash$ !== taskQrl().$hash$) {
    return null;
  }
  const task = captures[0];
  return isTask(task) ? task : null;
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
    const visibleTask = getCapturedTask(qrl as QRLInternal<unknown>);
    if (visibleTask) {
      serializationCtx.$eventQrls$.add(visibleTask.$qrl$);
    }
    if (runsOnPageLoad(scope, eventName)) {
      const pageLoadQrl = (visibleTask ? visibleTask.$qrl$ : qrl) as QRLInternal<unknown>;
      serializationCtx.$pageLoadQrls$.set(pageLoadQrl.$hash$, pageLoadQrl);
    }
  }
}

const runsOnPageLoad = (scope: string, eventName: string) =>
  scope.charAt(0) !== 'e' && eventName.charAt(0) === 'q' && eventName !== 'qidle';
