import { QwikHook } from '../words';
import { CoreOperation } from '../schema';
import { LocalKind } from './locals';

interface SetupCallContract {
  operation: CoreOperation;
  result: LocalKind.Const | LocalKind.Qrl | LocalKind.Signal;
  maxArgs?: number;
}

/** Binding-resolved core contracts, independent of call emission. */
export const coreSetupCalls: ReadonlyMap<string, SetupCallContract> = new Map([
  [
    QwikHook.UseSignal,
    {
      operation: CoreOperation.CreateSignal,
      result: LocalKind.Signal,
      maxArgs: 1,
    },
  ],
  [
    QwikHook.UseComputed,
    {
      operation: CoreOperation.CreateComputed,
      result: LocalKind.Signal,
    },
  ],
]);
