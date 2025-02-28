/**
 * Special value used to mark that a given signal needs to be computed. This is essentially a
 * "marked as dirty" flag.
 */
export const NEEDS_COMPUTATION: any = Symbol('invalid');

/** @internal */
export const _EFFECT_BACK_REF = Symbol('backRef');
