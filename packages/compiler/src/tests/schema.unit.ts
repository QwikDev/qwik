/** Schema gates (DESIGN.md "Phases"): fold truth tables, JSON round-trip, deep-freeze survivability. */
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
  const server = { environment: Environment.Server, mode: BuildMode.Prod };
  /** A host constant the build does not define stays a read. */
  const residual: Predicate = { p: PredicateKind.Host, name: 'VITE_FLAG' };

  test('targets are always concrete', () => {
    expect(foldPredicate(isServer, server)).toBe(true);
    expect(foldPredicate(isServer, { ...server, environment: Environment.Browser })).toBe(false);
    expect(foldPredicate(isBrowser, { ...server, environment: Environment.Browser })).toBe(true);
    expect(foldPredicate(isBrowser, server)).toBe(false);
  });

  test('isDev decides per mode', () => {
    expect(foldPredicate(isDev, { ...server, mode: BuildMode.Dev })).toBe(true);
    expect(foldPredicate(isDev, server)).toBe(false);
    expect(foldPredicate(isDev, { ...server, mode: BuildMode.Lib })).toBe(false);
  });

  test('a host constant decides when defined and is residual otherwise', () => {
    expect(foldPredicate(residual, { ...server, constants: { VITE_FLAG: true } })).toBe(true);
    expect(foldPredicate(residual, server)).toBe(null);
  });

  test('residual survives negation', () => {
    expect(foldPredicate({ p: PredicateKind.Not, operand: residual }, server)).toBe(null);
    expect(foldPredicate({ p: PredicateKind.Not, operand: isDev }, server)).toBe(true);
  });

  test('three-valued and/or short-circuit through residual', () => {
    const residualAndServer: Predicate = { p: PredicateKind.And, left: residual, right: isServer };
    const residualAndBrowser: Predicate = {
      p: PredicateKind.And,
      left: residual,
      right: isBrowser,
    };
    const residualOrServer: Predicate = { p: PredicateKind.Or, left: residual, right: isServer };
    const residualOrBrowser: Predicate = { p: PredicateKind.Or, left: residual, right: isBrowser };
    expect(foldPredicate(residualAndServer, server)).toBe(null);
    expect(foldPredicate(residualAndBrowser, server)).toBe(false);
    expect(foldPredicate(residualOrServer, server)).toBe(true);
    expect(foldPredicate(residualOrBrowser, server)).toBe(null);
    expect(foldPredicate({ p: PredicateKind.Lit, value: true }, server)).toBe(true);
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
    expect(Object.keys(specialization).sort()).toEqual(['environment', 'mode', 'strip']);
  });
});
