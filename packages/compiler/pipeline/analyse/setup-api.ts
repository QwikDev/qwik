import { QwikHook } from '../words';
import { LocalKind } from './locals';

interface SetupCallContract {
  importName: string;
  result: LocalKind.Const | LocalKind.Qrl | LocalKind.Signal;
  maxArgs?: number;
}

/** Binding-resolved core contracts, independent of call emission. */
export const coreSetupCalls: ReadonlyMap<string, SetupCallContract> = new Map([
  [
    QwikHook.UseSignal,
    {
      importName: QwikHook.UseSignal,
      result: LocalKind.Signal,
      maxArgs: 1,
    },
  ],
  [
    QwikHook.UseComputed,
    {
      importName: QwikHook.UseComputedQrl,
      result: LocalKind.Signal,
    },
  ],
]);
