import type { QObject } from '../object/q-object.public';
import { assertDefined, assertEqual, assertNotEqual } from '../assert/assert';
import { qProps } from '../props/q-props.public';
import { isQEvent } from '../event/q-event';
import type { PayloadOf, QEvent } from '../event/q-event.public';
import { isStateObj, unwrapProxy } from '../object/q-object';

/**
 * @public
 */
export function useHostElement(): Element {
  assertDefined(_hostElement, 'Invoking of `useHostElement()` outside of `use*()` context.');
  return _hostElement!;
}

/**
 * @public
 */
export function useEvent(): Event;
/**
 * @public
 */
export function useEvent<EVENT extends {}>(): EVENT;
/**
 * @public
 */
export function useEvent<EVENT extends QEvent>(qEvent: EVENT): PayloadOf<EVENT>;
/**
 * @public
 */
export function useEvent<EVENT extends {}>(expectEventType?: QEvent | string): EVENT;
/**
 * @public
 */
export function useEvent<EVENT extends {}>(expectEventType?: QEvent | string): EVENT {
  assertDefined(_event, 'Invoking of `useEvent()` outside of `use*()` context.');
  // TODO(misko): implement checking of expectEventType;
  expectEventType &&
    assertEqual(_event.type, isQEvent(expectEventType) ? expectEventType.type : expectEventType);
  return _event as any as EVENT;
}

/**
 * @public
 */
export function useURL(): URL {
  assertDefined(_event, 'Invoking of `useURL()` outside of `use*()` context.');
  return _url as URL;
}

//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////

export function _qSubscribe(qObjects: QObject<any>[]) {
  assertDefined(
    _subscriptions,
    'Invoking of `qSubscribe()` outside of `use*()` context of `onRender`.'
  );
  qObjects.forEach((v) => !isStateObj(v) && _subscriptions!.add(v));
}

export function safeQSubscribe(qObject: QObject<any>): void {
  assertNotEqual(unwrapProxy(qObject), qObject, 'Expecting Proxy');
  _subscriptions && qObject && _subscriptions.add(qObject);
}

let _hostElement: Element | null;
let _event: any;
let _url: URL;
let _subscriptions: undefined | Set<QObject<any>>;

export function useInvoke<RET = any>(
  fn: () => RET,
  element: Element | null,
  event: any,
  url: URL
): RET {
  const isRender = event === 'qRender';
  try {
    _hostElement = element;
    _event = event;
    _url = url;
    isRender && (_subscriptions = new Set());
    return fn();
  } finally {
    _hostElement = undefined!;
    _event = undefined!;
    _url = undefined!;
    if (_subscriptions) {
      element && ((qProps(element) as any)[':subscriptions'] = _subscriptions);
      _subscriptions = undefined!;
    }
  }
}
