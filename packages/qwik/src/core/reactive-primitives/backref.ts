import { qwikSymbol } from '../shared/singletons';
/** @internal */
export const _EFFECT_BACK_REF: unique symbol = /*#__PURE__*/ qwikSymbol('backRef');

/** Class for back reference to the EffectSubscription */
export abstract class BackRef {
  [_EFFECT_BACK_REF]: Map<any, any> | undefined = undefined;
}
