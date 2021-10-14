import type { QHook } from '../component/qrl-hook.public';

/**
 * @public
 */
export interface QEvent<PAYLOAD extends {} = {}> {
  __type_brand__: 'QEvent';
  __type_payload__: PAYLOAD;
  type: string;
  <HOOK extends QHook<any, any, any, any>>(qrl: HOOK): Record<string, HOOK>;
}

/**
 * @public
 */
export function qEvent<PAYLOAD extends {} = {}>(type: string): QEvent<PAYLOAD> {
  const event: QEvent<PAYLOAD> = function <HOOK extends QHook<any, any, any, any>>(
    hook: HOOK
  ): Record<string, HOOK> {
    return { ['on:' + type]: hook };
  } as any;
  event.type = type;
  return event;
}

/**
 * @public
 */
export type PayloadOf<QEVENT extends QEvent> = QEVENT extends QEvent<infer PAYLOAD>
  ? PAYLOAD
  : never;
