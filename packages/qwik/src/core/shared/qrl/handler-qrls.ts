import { _run } from '../../client/run-qrl';
import { _hmr } from '../../use/use-hmr';
import { _rsc } from '../../use/use-resource';
import { scheduleTask } from '../../use/use-task';
import { _chk, _res, _val } from '../jsx/bind-handlers';
import type { QRLInternal } from './qrl-class';
import { $ } from './qrl.public';

/** Created on first use: unbundled, this module can load before the QRL machinery has. */
const onFirstUse = <T>(create: () => T) => {
  let value: T | undefined;
  return () => (value ??= create());
};

/*
 * Core functions that read their own captures; the qwikloader calls most of them with the
 * serialized captures as `this`. Bind captures with `.w([...])`.
 */
export const runQrl = onFirstUse(() => $(_run) as QRLInternal<typeof _run>);
export const chkQrl = onFirstUse(() => $(_chk) as QRLInternal<typeof _chk>);
export const valQrl = onFirstUse(() => $(_val) as QRLInternal<typeof _val>);
export const resQrl = onFirstUse(() => $(_res) as QRLInternal<typeof _res>);
export const taskQrl = onFirstUse(() => $(scheduleTask) as QRLInternal<typeof scheduleTask>);
export const hmrQrl = onFirstUse(() => $(_hmr) as QRLInternal<typeof _hmr>);
export const rscQrl = onFirstUse(() => $(_rsc) as QRLInternal<typeof _rsc>);

/** Whether the qwikloader can call `qrl` directly, as it deserializes its own captures. */
export const readsOwnCaptures = (qrl: QRLInternal<unknown>) =>
  [runQrl, chkQrl, valQrl, resQrl, taskQrl, hmrQrl].some(
    (handlerQrl) => handlerQrl().$hash$ === qrl.$hash$
  );

/**
 * The optimizer binds `bind:value` and `bind:checked` to `_val` and `_chk` themselves, as
 * `inlinedQrl(_val, '_val', [signal])`; only core's own QRLs have a chunk to load them from.
 */
export const toCoreHandlerQrl = (qrl: QRLInternal<unknown>): QRLInternal<unknown> => {
  const fn = qrl.$lazy$.$ref$;
  const handlerQrl = fn === _val ? valQrl() : fn === _chk ? chkQrl() : null;
  // Serialized captures keep the QRL they came with: a copy would lose their container.
  return handlerQrl && Array.isArray(qrl.$captures$)
    ? (handlerQrl.w(qrl.$captures$) as QRLInternal<unknown>)
    : qrl;
};
