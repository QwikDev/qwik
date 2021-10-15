import type { QHook } from '../component/qrl-hook.public';
import type { QRL } from '../import/qrl';
import { qObject } from '../object/q-object.public';

export interface QEffect<PROPS = object, STATE = object> {
  __PROPS__: PROPS;
  __STATE__: STATE;
  (props: PROPS): STATE;
  onResume: QHook<PROPS, STATE, undefined, void> | null;
  onUnmount: QHook<PROPS, STATE, undefined, void> | null;
  onDehydrate: QHook<PROPS, STATE, undefined, void> | null;
  onHydrate: QHook<PROPS, STATE, undefined, void> | null;
}

export function qEffect<PROPS = {}, STATE = {}>({
  onMount: createState,
  onResume,
  onUnmount,
  onHydrate,
  onDehydrate,
}: {
  onMount: CreateState<PROPS, STATE>;
  onResume?: QHook<PROPS, STATE, undefined, void>;
  onUnmount?: QHook<PROPS, STATE, undefined, void>;
  onDehydrate?: QHook<PROPS, STATE, undefined, void>;
  onHydrate?: QHook<PROPS, STATE, undefined, void>;
  listen?: Record<string, QRL<TBI>>;
}): QEffect<PROPS, STATE> {
  const effect = function QEffect(props: PROPS): STATE {
    //const element = useElement();
    return qObject(createState(props));
  } as QEffect<PROPS, STATE>;
  effect.onResume = onResume || null;
  effect.onUnmount = onUnmount || null;
  effect.onDehydrate = onDehydrate || null;
  effect.onHydrate = onHydrate || null;
  return effect;
}

export function useElement(): HTMLElement {
  return null!;
}

// TODO(misko): To be implemented
type TBI = any;

type CreateState<PROPS, STATE> = (props: PROPS) => STATE;

export type PropsOf<EFFECT extends QEffect> = EFFECT extends QEffect<infer PROPS> ? PROPS : never;
export type StateOf<EFFECT extends QEffect> = EFFECT extends QEffect<{}, infer STATE>
  ? STATE
  : never;
