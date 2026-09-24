/** @internal */
export const _EFFECT_BACK_REF = Symbol.for('qwik.backRef');

/** Class for back reference to the EffectSubscription */
export abstract class BackRef {
  [_EFFECT_BACK_REF]: Map<any, any> | undefined = undefined;
}
