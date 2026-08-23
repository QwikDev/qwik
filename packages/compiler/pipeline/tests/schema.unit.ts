/**
 * Schema gates (DESIGN.md "Phases" — slice 1 schema gates): fold truth tables, JSON round-trip,
 * deep-freeze survivability.
 */
import { describe, expect, test } from 'vitest';
import {
  BuildConstant,
  BuildMode,
  Environment,
  foldPredicate,
  PlanFormat,
  PredicateKind,
  type Predicate,
} from '../schema';
import { deepFreeze, emptyLinkedPlan, emptyModulePlan, serverSpecialization } from './fixtures';

const isServer: Predicate = { p: PredicateKind.Const, name: BuildConstant.IsServer };
const isBrowser: Predicate = { p: PredicateKind.Const, name: BuildConstant.IsBrowser };
const isDev: Predicate = { p: PredicateKind.Const, name: BuildConstant.IsDev };

describe('foldPredicate', () => {
  test('targets are always concrete, even under mode "unknown"', () => {
    expect(
      foldPredicate(isServer, { environment: Environment.Server, mode: BuildMode.Unknown })
    ).toBe(true);
    expect(
      foldPredicate(isServer, { environment: Environment.Browser, mode: BuildMode.Unknown })
    ).toBe(false);
    expect(
      foldPredicate(isBrowser, { environment: Environment.Browser, mode: BuildMode.Unknown })
    ).toBe(true);
    expect(
      foldPredicate(isBrowser, { environment: Environment.Server, mode: BuildMode.Unknown })
    ).toBe(false);
  });

  test('isDev decides per mode; dev and hmr agree; unknown is residual', () => {
    expect(foldPredicate(isDev, { environment: Environment.Server, mode: BuildMode.Dev })).toBe(
      true
    );
    expect(foldPredicate(isDev, { environment: Environment.Server, mode: BuildMode.Hmr })).toBe(
      true
    );
    expect(foldPredicate(isDev, { environment: Environment.Server, mode: BuildMode.Prod })).toBe(
      false
    );
    expect(foldPredicate(isDev, { environment: Environment.Server, mode: BuildMode.Lib })).toBe(
      false
    );
    expect(foldPredicate(isDev, { environment: Environment.Server, mode: BuildMode.Unknown })).toBe(
      null
    );
  });

  test('residual survives negation', () => {
    const notDev: Predicate = { p: PredicateKind.Not, operand: isDev };
    expect(
      foldPredicate(notDev, { environment: Environment.Server, mode: BuildMode.Unknown })
    ).toBe(null);
    expect(foldPredicate(notDev, { environment: Environment.Server, mode: BuildMode.Dev })).toBe(
      false
    );
  });

  test('three-valued and/or short-circuit through residual', () => {
    const unknownCtx = { environment: Environment.Server, mode: BuildMode.Unknown };
    const devAndServer: Predicate = { p: PredicateKind.And, left: isDev, right: isServer };
    const devAndBrowser: Predicate = { p: PredicateKind.And, left: isDev, right: isBrowser };
    const devOrServer: Predicate = { p: PredicateKind.Or, left: isDev, right: isServer };
    const devOrBrowser: Predicate = { p: PredicateKind.Or, left: isDev, right: isBrowser };
    expect(foldPredicate(devAndServer, unknownCtx)).toBe(null);
    expect(foldPredicate(devAndBrowser, unknownCtx)).toBe(false);
    expect(foldPredicate(devOrServer, unknownCtx)).toBe(true);
    expect(foldPredicate(devOrBrowser, unknownCtx)).toBe(null);
    expect(foldPredicate({ p: PredicateKind.Lit, value: true }, unknownCtx)).toBe(true);
  });
});

describe('plan envelopes', () => {
  test('ModulePlan round-trips through JSON', () => {
    const plan = emptyModulePlan('src/app.tsx');
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  test('LinkedPlan round-trips through JSON', () => {
    const plan = emptyLinkedPlan(serverSpecialization());
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  test('deep-frozen plans stay readable', () => {
    const plan = deepFreeze(emptyModulePlan('src/app.tsx'));
    expect(plan.format).toBe(PlanFormat.ModulePlan);
    expect(Object.isFrozen(plan.source)).toBe(true);
  });

  test('specialization is environment + mode + generic policy only', () => {
    const specialization = serverSpecialization();
    expect(Object.keys(specialization).sort()).toEqual(['environment', 'mode', 'stripExports']);
  });
});
